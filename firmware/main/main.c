// Overhead-scherm: toont elke minuut het beeld van /api/frame (jpg, 1024 x 600).
//
// Verloop:
//  1. scherm aan, "Even geduld"
//  2. wifi uit NVS; geen wifi of na 45 s geen verbinding -> toegangspunt "Overhead-scherm" + instelportaal
//     (blijft ondertussen proberen met de bewaarde wifi)
//  3. beeld ophalen, tonen, X-Refresh seconden wachten; X-Night=1 -> verlichting gedimd
//  4. af en toe nagaan of er nieuwe firmware is
//  Kort tikken: balk voor de helderheid (links donkerder, rechts lichter).
//  Lang (5 s) aanraken: wifi vergeten en herstarten met het portaal.
#include <string.h>
#include <stdlib.h>
#include "app.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_ota_ops.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "overhead";
static settings_t cfg;
static volatile bool setup_mode;
static void apply_brightness(void);

#define BRIGHT_DAY 60
#define BRIGHT_NIGHT 12

static void show_setup(void)
{
    setup_mode = true;
    display_show_jpeg(setup_jpg_start, setup_jpg_end - setup_jpg_start);
    apply_brightness();
    portal_start();
}

// Haalt het beeld op in de invoerbuffer van de decoder. Geeft de lengte terug (0 bij een fout).
static size_t fetch(int *refresh, bool *night, int *bright)
{
    char url[300];
    strlcpy(url, cfg.url, sizeof(url));
    if (!strstr(url, "format=")) strlcat(url, strchr(url, '?') ? "&format=jpg" : "?format=jpg", sizeof(url));

    size_t cap;
    uint8_t *buf = display_jpeg_buffer(&cap);
    esp_http_client_config_t c = {
        .url = url,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .timeout_ms = 20000,
        .buffer_size = 4096,
        .buffer_size_tx = 2048, // de url kan lang zijn
        .user_agent = "overhead-scherm/" CONFIG_OVERHEAD_VERSION,
    };
    esp_http_client_handle_t h = esp_http_client_init(&c);
    size_t got = 0;
    if (esp_http_client_open(h, 0) == ESP_OK) {
        esp_http_client_fetch_headers(h);
        int status = esp_http_client_get_status_code(h);
        char *v = NULL;
        if (esp_http_client_get_header(h, "X-Refresh", &v) == ESP_OK && v) *refresh = atoi(v);
        v = NULL;
        if (esp_http_client_get_header(h, "X-Night", &v) == ESP_OK && v) *night = v[0] == '1';
        v = NULL;
        if (esp_http_client_get_header(h, "X-Brightness", &v) == ESP_OK && v) *bright = atoi(v); // de server bepaalt de helderheid
        if (status == 200) {
            int n;
            while (got < cap && (n = esp_http_client_read(h, (char *)buf + got, cap - got)) > 0) got += n;
            if (got >= cap) { ESP_LOGW(TAG, "beeld te groot"); got = 0; }
        } else {
            ESP_LOGW(TAG, "server antwoordt %d", status);
        }
    } else {
        ESP_LOGW(TAG, "geen verbinding met %s", url);
    }
    esp_http_client_cleanup(h);
    return got;
}

/* ---------- Helderheid: de server geeft een basis (dag/nacht), de gebruiker schuift er een niveau op ---------- */
static const int OFFS[] = { -15, -10, -5, 0, 5, 10, 15, 25, 35, 50 };
#define LEVELS (int)(sizeof(OFFS) / sizeof(OFFS[0]))
#define LEVEL_DEFAULT 3
static int level = LEVEL_DEFAULT, srv_bright = -1;
static bool srv_night;

static void apply_brightness(void)
{
    int base = srv_bright >= 0 ? srv_bright : srv_night ? BRIGHT_NIGHT : BRIGHT_DAY;
    int off = OFFS[level];
    if (srv_night) off /= 4; // 's nachts maar een beetje bijsturen
    int b = base + off;
    display_brightness(b < 1 ? 1 : b > 100 ? 100 : b);
}

// Aanraken:
//  - kort tikken toont de balk voor de helderheid; tik dan links (donkerder) of rechts (lichter)
//  - 5 s vasthouden: wifi vergeten en herstarten met het portaal
static void touch_task(void *arg)
{
    bool down = false;
    int64_t since = 0, last_seen = 0, bar_until = 0;
    int x = 0, y = 0, tx = 0;
    for (;;) {
        int64_t now = esp_timer_get_time();
        int r = touch_read(&x, &y);
        if (r == 1) {
            if (!down) { down = true; since = now; }
            last_seen = now;
            tx = x;
        }
        bool released = down && (r == 0 || now - last_seen > 300000);
        if (down && !released && now - since > 5000000 && !setup_mode) {
            ESP_LOGI(TAG, "lang aangeraakt: wifi vergeten en opnieuw instellen");
            settings_forget_wifi();
            esp_restart(); // start zonder wifi, dus met het portaal
        }
        if (released) {
            down = false;
            if (last_seen - since < 1000000) { // een tik
                if (now < bar_until) {
                    int d = tx < APP_W / 3 ? -1 : tx > APP_W * 2 / 3 ? 1 : 0;
                    int nl = level + d;
                    if (nl >= 0 && nl < LEVELS && nl != level) {
                        level = nl;
                        settings_set_int("bright", level);
                        apply_brightness();
                        ESP_LOGI(TAG, "helderheid: niveau %d", level);
                    }
                }
                display_level(level, LEVELS);
                bar_until = now + 4000000;
            }
        }
        if (bar_until && now > bar_until) {
            bar_until = 0;
            display_redraw();
        }
        vTaskDelay(pdMS_TO_TICKS(30));
    }
}

static void frame_task(void *arg)
{
    int fails = 0;
    bool shown = false;
    int64_t last_ota = -1;
    for (;;) {
        if (!net_connected()) {
            if (!net_wait_connected(30000)) {
                if (!setup_mode && !shown) show_setup();
                continue;
            }
        }
        if (setup_mode) {
            // Verbonden terwijl het portaal openstaat: opnieuw starten in de gewone stand
            ESP_LOGI(TAG, "wifi is er (weer), herstarten zonder portaal");
            vTaskDelay(pdMS_TO_TICKS(1000));
            esp_restart();
        }
        int refresh = 60;
        bool night = false;
        int bright = -1;
        size_t len = fetch(&refresh, &night, &bright);
        if (len && display_show_buffer(len) == ESP_OK) {
            if (!shown) {
                improv_set_state(4, cfg.url);
                // Deze versie werkt (wifi, server, scherm): na een update niet terugdraaien
                esp_ota_mark_app_valid_cancel_rollback();
            }
            shown = true;
            fails = 0;
            srv_bright = bright;
            srv_night = night;
            apply_brightness();
        } else {
            refresh = 30;
            if (++fails == 10) { // ± 5 minuten niets: toon het, maar het laatste goede beeld blijft tot dan staan
                display_show_jpeg(offline_jpg_start, offline_jpg_end - offline_jpg_start);
                shown = false;
            }
        }
        if (refresh < 15) refresh = 15;
        if (refresh > 3600) refresh = 3600;

        // Updates: kort na het opstarten en daarna om de 6 uur
        int64_t now = esp_timer_get_time() / 1000000;
        if (last_ota < 0 ? now > 60 : now - last_ota > 6 * 3600) {
            last_ota = now;
            ota_check(cfg.url);
        }
        vTaskDelay(pdMS_TO_TICKS(refresh * 1000));
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Overhead-scherm %s (%s)", CONFIG_OVERHEAD_VERSION, CONFIG_OVERHEAD_VARIANT);
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }
    if (display_init() != ESP_OK) {
        ESP_LOGE(TAG, "scherm start niet");
    }
    display_show_jpeg(start_jpg_start, start_jpg_end - start_jpg_start);
    level = settings_get_int("bright", LEVEL_DEFAULT);
    if (level < 0 || level >= LEVELS) level = LEVEL_DEFAULT;
    apply_brightness();
    if (touch_init() == ESP_OK) xTaskCreate(touch_task, "touch", 3072, NULL, 3, NULL);

    settings_load(&cfg);
    ESP_LOGI(TAG, "beeld: %s", cfg.url);

    // De wifi-chip (ESP32-C6) zelf resetten via zijn EN-pin (GPIO32 volgens het schema). Na een herstart van
    // de P4 (update, herstart na instellen) blijft de C6 anders in de vorige sessie hangen en komt de wifi niet op.
    // Kort laag trekken en daarna loslaten: de weerstand op het bord trekt EN weer hoog.
    gpio_config_t en = { .pin_bit_mask = 1ULL << 32, .mode = GPIO_MODE_OUTPUT };
    gpio_config(&en);
    gpio_set_level(32, 0);
    vTaskDelay(pdMS_TO_TICKS(50));
    gpio_set_direction(32, GPIO_MODE_INPUT);
    vTaskDelay(pdMS_TO_TICKS(300));
    ESP_LOGI(TAG, "wifi-chip gereset");

    ESP_ERROR_CHECK(net_init());
    improv_start();

    if (cfg.ssid[0]) {
        net_connect(cfg.ssid, cfg.pass);
        if (!net_wait_connected(45000)) show_setup(); // blijft het ondertussen proberen
    } else {
        show_setup();
    }
    xTaskCreate(frame_task, "frame", 8192, NULL, 5, NULL);
}
