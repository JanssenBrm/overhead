// Aanraking via de GT911 (I2C0: SDA 45, SCL 46, RST 40, INT 42).
// We hebben alleen "wordt het scherm aangeraakt?" nodig: lang aanraken = wifi opnieuw instellen.
#include "app.h"
#include "esp_check.h"
#include "esp_log.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "touch";
static i2c_master_dev_handle_t dev;

static esp_err_t rd(uint16_t reg, uint8_t *buf, size_t n)
{
    uint8_t r[2] = { reg >> 8, reg & 0xff };
    return i2c_master_transmit_receive(dev, r, 2, buf, n, 50);
}
static esp_err_t wr8(uint16_t reg, uint8_t v)
{
    uint8_t b[3] = { reg >> 8, reg & 0xff, v };
    return i2c_master_transmit(dev, b, 3, 50);
}

esp_err_t touch_init(void)
{
    i2c_master_bus_handle_t bus;
    const i2c_master_bus_config_t bcfg = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = 45,
        .scl_io_num = 46,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_RETURN_ON_ERROR(i2c_new_master_bus(&bcfg, &bus), TAG, "i2c");

    // Reset met INT laag: de GT911 kiest dan adres 0x5D
    gpio_config_t g = { .pin_bit_mask = (1ULL << 40) | (1ULL << 42), .mode = GPIO_MODE_OUTPUT };
    gpio_config(&g);
    gpio_set_level(40, 0);
    gpio_set_level(42, 0);
    vTaskDelay(pdMS_TO_TICKS(15));
    gpio_set_level(40, 1);
    vTaskDelay(pdMS_TO_TICKS(60));
    gpio_set_direction(42, GPIO_MODE_INPUT);

    const uint16_t addrs[] = { 0x5D, 0x14 };
    for (int i = 0; i < 2; i++) {
        if (i2c_master_probe(bus, addrs[i], 50) == ESP_OK) {
            const i2c_device_config_t dcfg = { .dev_addr_length = I2C_ADDR_BIT_LEN_7, .device_address = addrs[i], .scl_speed_hz = 400000 };
            ESP_RETURN_ON_ERROR(i2c_master_bus_add_device(bus, &dcfg, &dev), TAG, "dev");
            ESP_LOGI(TAG, "GT911 op 0x%02X", addrs[i]);
            return ESP_OK;
        }
    }
    ESP_LOGW(TAG, "geen GT911 gevonden: aanraken werkt niet");
    return ESP_ERR_NOT_FOUND;
}

bool touch_pressed(void)
{
    if (!dev) return false;
    uint8_t st = 0;
    if (rd(0x814E, &st, 1) != ESP_OK) return false;
    if (!(st & 0x80)) return false;      // nog geen nieuwe meting
    wr8(0x814E, 0);                      // meting bevestigen
    return (st & 0x0F) > 0;
}
