// 10,1"-scherm (EK79007, MIPI-DSI, 1024 x 600) met verlichting op GPIO31,
// en de jpg-decoder van de ESP32-P4 die rechtstreeks naar RGB565 decodeert.
// Instellingen overgenomen uit de voorbeelden van Elecrow (Lesson07/16, V1.2).
#include <string.h>
#include "app.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
#include "esp_ldo_regulator.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_ek79007.h"
#include "driver/ledc.h"
#include "driver/jpeg_decode.h"
#include "esp_cache.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "display";

#define PIN_BACKLIGHT 31
#define IN_CAPACITY (640 * 1024)              // ruim voor een beeld van ± 75-200 KB
#define OUT_ROWS ((APP_H + 15) / 16 * 16)    // de decoder werkt per 16 rijen (4:2:0): 608

static esp_lcd_panel_handle_t panel;
static jpeg_decoder_handle_t jpgd;
static uint8_t *in_buf, *out_buf;
static uint16_t *fb;            // framebuffer van het paneel: we schrijven er zelf in, zonder DMA2D
static size_t in_cap, out_cap;
static SemaphoreHandle_t lock;
static size_t last_bytes;       // grootte van het laatst getoonde beeld in out_buf

static esp_err_t backlight_init(void)
{
    const ledc_timer_config_t t = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_11_BIT,
        .timer_num = LEDC_TIMER_0,
        .freq_hz = 30000,
        .clk_cfg = LEDC_USE_PLL_DIV_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&t), TAG, "ledc timer");
    const ledc_channel_config_t c = {
        .gpio_num = PIN_BACKLIGHT,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
    };
    return ledc_channel_config(&c);
}

void display_brightness(int percent)
{
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    // Zelfde schaal als Elecrow: onder ± 200/2047 blijft de verlichting uit
    uint32_t duty = percent == 0 ? 0 : 200 + (uint32_t)percent * (2047 - 200) / 100;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

esp_err_t display_init(void)
{
    lock = xSemaphoreCreateMutex();

    // De MIPI-PHY krijgt zijn spanning van LDO3 (2,5 V)
    static esp_ldo_channel_handle_t ldo3;
    const esp_ldo_channel_config_t ldo_cfg = { .chan_id = 3, .voltage_mv = 2500 };
    ESP_RETURN_ON_ERROR(esp_ldo_acquire_channel(&ldo_cfg, &ldo3), TAG, "ldo3");

    ESP_RETURN_ON_ERROR(backlight_init(), TAG, "backlight");

    esp_lcd_dsi_bus_handle_t bus;
    const esp_lcd_dsi_bus_config_t bus_cfg = {
        .bus_id = 0,
        .num_data_lanes = 2,
        .phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
        .lane_bit_rate_mbps = 900,
    };
    ESP_RETURN_ON_ERROR(esp_lcd_new_dsi_bus(&bus_cfg, &bus), TAG, "dsi bus");

    esp_lcd_panel_io_handle_t io;
    const esp_lcd_dbi_io_config_t dbi_cfg = { .virtual_channel = 0, .lcd_cmd_bits = 8, .lcd_param_bits = 8 };
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_dbi(bus, &dbi_cfg, &io), TAG, "dbi io");

    const esp_lcd_dpi_panel_config_t dpi_cfg = {
        .dpi_clk_src = MIPI_DSI_DPI_CLK_SRC_DEFAULT,
        .dpi_clock_freq_mhz = 51,
        .virtual_channel = 0,
        .pixel_format = LCD_COLOR_PIXEL_FORMAT_RGB565,
        .num_fbs = 1,
        .video_timing = {
            .h_size = APP_W,
            .v_size = APP_H,
            .hsync_back_porch = 160,
            .hsync_pulse_width = 70,
            .hsync_front_porch = 160,
            .vsync_back_porch = 23,
            .vsync_pulse_width = 10,
            .vsync_front_porch = 12,
        },
    };
    ek79007_vendor_config_t vendor = {
        .mipi_config = { .dsi_bus = bus, .dpi_config = &dpi_cfg, .lane_num = 2 },
    };
    const esp_lcd_panel_dev_config_t panel_cfg = {
        .reset_gpio_num = -1,
        .rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB,
        .bits_per_pixel = 16,
        .vendor_config = &vendor,
    };
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_ek79007(io, &panel_cfg, &panel), TAG, "panel");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(panel), TAG, "reset");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_init(panel), TAG, "init");
    void *fbp = NULL;
    ESP_RETURN_ON_ERROR(esp_lcd_dpi_panel_get_frame_buffer(panel, 1, &fbp), TAG, "framebuffer");
    fb = fbp;
    ESP_LOGI(TAG, "framebuffer op %p", fb);

    // jpg-decoder en zijn buffers (moeten met jpeg_alloc_decoder_mem gemaakt worden)
    const jpeg_decode_engine_cfg_t eng = { .timeout_ms = 200 };
    ESP_RETURN_ON_ERROR(jpeg_new_decoder_engine(&eng, &jpgd), TAG, "jpeg engine");
    jpeg_decode_memory_alloc_cfg_t in_mem = { .buffer_direction = JPEG_DEC_ALLOC_INPUT_BUFFER };
    jpeg_decode_memory_alloc_cfg_t out_mem = { .buffer_direction = JPEG_DEC_ALLOC_OUTPUT_BUFFER };
    in_buf = jpeg_alloc_decoder_mem(IN_CAPACITY, &in_mem, &in_cap);
    out_buf = jpeg_alloc_decoder_mem(APP_W * OUT_ROWS * 2, &out_mem, &out_cap);
    if (!in_buf || !out_buf) {
        ESP_LOGE(TAG, "geen geheugen voor de jpg-buffers");
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "scherm klaar (in %u KB, uit %u KB)", (unsigned)(in_cap / 1024), (unsigned)(out_cap / 1024));
    return ESP_OK;
}

uint8_t *display_jpeg_buffer(size_t *capacity)
{
    *capacity = in_cap;
    return in_buf;
}

esp_err_t display_show_buffer(size_t len)
{
    jpeg_decode_picture_info_t info;
    esp_err_t err = jpeg_decoder_get_info(in_buf, len, &info);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "geen geldige jpg (%s)", esp_err_to_name(err));
        return err;
    }
    if (info.width != APP_W || info.height > OUT_ROWS) {
        ESP_LOGW(TAG, "verkeerde beeldgrootte %ux%u", (unsigned)info.width, (unsigned)info.height);
        return ESP_ERR_INVALID_SIZE;
    }
    const jpeg_decode_cfg_t cfg = {
        .output_format = JPEG_DECODE_OUT_FORMAT_RGB565,
        .rgb_order = JPEG_DEC_RGB_ELEMENT_ORDER_BGR, // RGB565 little-endian, zoals het scherm verwacht
    };
    uint32_t out_size = 0;
    xSemaphoreTake(lock, portMAX_DELAY);
    err = jpeg_decoder_process(jpgd, &cfg, in_buf, len, out_buf, out_cap, &out_size);
    if (err == ESP_OK) {
        // Rechtstreeks in de framebuffer kopiëren en de cache wegschrijven, zodat het paneel het ziet
        int rows = info.height < APP_H ? info.height : APP_H;
        size_t bytes = (size_t)APP_W * rows * 2;
        // De decoder schreef via DMA: eerst de cache voor out_buf ongeldig maken, anders leest de CPU oude data
        esp_cache_msync(out_buf, out_cap, ESP_CACHE_MSYNC_FLAG_DIR_M2C);
        memcpy(fb, out_buf, bytes);
        last_bytes = bytes;
        err = esp_cache_msync(fb, (size_t)APP_W * APP_H * 2, ESP_CACHE_MSYNC_FLAG_DIR_C2M | ESP_CACHE_MSYNC_FLAG_UNALIGNED);
        const uint16_t *px = (const uint16_t *)out_buf;
        ESP_LOGI(TAG, "beeld getoond (%ux%u, pixels %04x %04x %04x)", (unsigned)info.width, (unsigned)info.height,
                 px[0], px[APP_W * 300 + 512], px[APP_W * (rows - 1) + APP_W - 1]);
    }
    xSemaphoreGive(lock);
    if (err != ESP_OK) ESP_LOGW(TAG, "tonen mislukt: %s", esp_err_to_name(err));
    return err;
}

esp_err_t display_show_jpeg(const uint8_t *jpg, size_t len)
{
    if (len > in_cap) return ESP_ERR_INVALID_SIZE;
    xSemaphoreTake(lock, portMAX_DELAY);
    memcpy(in_buf, jpg, len);
    xSemaphoreGive(lock);
    return display_show_buffer(len);
}

/* ---------- Balk voor de helderheid: rechtstreeks in de framebuffer getekend ---------- */
#define RGB565(r, g, b) (uint16_t)((((r) >> 3) << 11) | (((g) >> 2) << 5) | ((b) >> 3))

static void fill(int x, int y, int w, int h, uint16_t c)
{
    for (int r = y; r < y + h; r++) {
        if (r < 0 || r >= APP_H) continue;
        uint16_t *row = fb + r * APP_W;
        for (int k = x; k < x + w; k++) if (k >= 0 && k < APP_W) row[k] = c;
    }
}

// Afgeronde rechthoek: per rij de breedte van de kwartcirkels in de hoeken uitrekenen
static void rounded(int x, int y, int w, int h, int r, uint16_t c)
{
    for (int dy = 0; dy < h; dy++) {
        int ry = dy < r ? r - dy : dy >= h - r ? dy - (h - r - 1) : 0;
        int dx = 0;
        while (dx < r && (r - dx) * (r - dx) + ry * ry > r * r) dx++;
        fill(x + dx, y + dy, w - 2 * dx, 1, c);
    }
}

void display_level(int level, int levels)
{
    if (!fb) return;
    const int W = 440, H = 76, X = (APP_W - W) / 2, Y = APP_H - H - 40;
    const uint16_t bg = RGB565(28, 30, 34), on = RGB565(255, 255, 255), off = RGB565(78, 82, 90);
    xSemaphoreTake(lock, portMAX_DELAY);
    rounded(X, Y, W, H, H / 2, bg);
    // links een min, rechts een plus
    fill(X + 34, Y + H / 2 - 3, 26, 6, on);
    fill(X + W - 60, Y + H / 2 - 3, 26, 6, on);
    fill(X + W - 50, Y + H / 2 - 13, 6, 26, on);
    // de niveaus als blokjes, oplopend in hoogte
    const int gx = X + 90, gw = W - 180, gap = 6, bw = (gw - gap * (levels - 1)) / levels;
    for (int i = 0; i < levels; i++) {
        int bh = 12 + (30 * i) / (levels - 1);
        fill(gx + i * (bw + gap), Y + H / 2 + 21 - bh, bw, bh, i <= level ? on : off);
    }
    esp_cache_msync(fb, (size_t)APP_W * APP_H * 2, ESP_CACHE_MSYNC_FLAG_DIR_C2M | ESP_CACHE_MSYNC_FLAG_UNALIGNED);
    xSemaphoreGive(lock);
}

void display_redraw(void)
{
    if (!fb) return;
    xSemaphoreTake(lock, portMAX_DELAY);
    if (last_bytes) {
        memcpy(fb, out_buf, last_bytes);
        esp_cache_msync(fb, (size_t)APP_W * APP_H * 2, ESP_CACHE_MSYNC_FLAG_DIR_C2M | ESP_CACHE_MSYNC_FLAG_UNALIGNED);
    }
    xSemaphoreGive(lock);
}
