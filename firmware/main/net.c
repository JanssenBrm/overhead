// Wifi via de ESP32-C6 (esp_hosted over SDIO); voor de code is het gewone esp_wifi.
#include <string.h>
#include "app.h"
#include "esp_check.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/timers.h"

static const char *TAG = "net";
static EventGroupHandle_t ev;
#define CONNECTED BIT0
static bool want_sta, ap_on;
static TimerHandle_t retry;
static void do_retry(TimerHandle_t t) { if (want_sta) esp_wifi_connect(); }

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START && want_sta) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(ev, CONNECTED);
        if (want_sta) {
            wifi_event_sta_disconnected_t *d = data;
            ESP_LOGW(TAG, "wifi verbroken (reden %d), opnieuw", d->reason);
            // Niet wachten in de gebeurtenislus: een timer probeert het straks opnieuw.
            // Met het portaal open rustiger, want zoeken naar het netwerk stoort het toegangspunt.
            xTimerChangePeriod(retry, pdMS_TO_TICKS(ap_on ? 15000 : 3000), 0);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *e = data;
        ESP_LOGI(TAG, "verbonden, IP " IPSTR, IP2STR(&e->ip_info.ip));
        xEventGroupSetBits(ev, CONNECTED);
    }
}

esp_err_t net_init(void)
{
    ev = xEventGroupCreate();
    retry = xTimerCreate("retry", pdMS_TO_TICKS(3000), pdFALSE, NULL, do_retry);
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&cfg), TAG, "wifi init");
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_event, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_event, NULL);
    esp_wifi_set_storage(WIFI_STORAGE_RAM);
    esp_wifi_set_mode(WIFI_MODE_STA);
    return esp_wifi_start();
}

void net_connect(const char *ssid, const char *pass)
{
    wifi_config_t c = { 0 };
    strlcpy((char *)c.sta.ssid, ssid, sizeof(c.sta.ssid));
    strlcpy((char *)c.sta.password, pass, sizeof(c.sta.password));
    c.sta.threshold.authmode = pass[0] ? WIFI_AUTH_WPA_PSK : WIFI_AUTH_OPEN;
    c.sta.pmf_cfg.capable = true;
    c.sta.scan_method = WIFI_ALL_CHANNEL_SCAN;
    c.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;
    want_sta = true;
    esp_wifi_disconnect();
    esp_wifi_set_config(WIFI_IF_STA, &c);
    esp_wifi_connect();
}

bool net_wait_connected(int timeout_ms)
{
    return xEventGroupWaitBits(ev, CONNECTED, pdFALSE, pdTRUE, pdMS_TO_TICKS(timeout_ms)) & CONNECTED;
}

bool net_connected(void) { return xEventGroupGetBits(ev) & CONNECTED; }

void net_start_ap(void)
{
    if (ap_on) return;
    ap_on = true;
    wifi_config_t c = { 0 };
    strlcpy((char *)c.ap.ssid, AP_SSID, sizeof(c.ap.ssid));
    c.ap.ssid_len = strlen(AP_SSID);
    c.ap.channel = 1;
    c.ap.max_connection = 2;
    c.ap.authmode = WIFI_AUTH_OPEN; // open, zodat iedereen het kan instellen; enkel bereikbaar zolang dit scherm toont
    esp_wifi_set_mode(WIFI_MODE_APSTA);
    esp_wifi_set_config(WIFI_IF_AP, &c);
    ESP_LOGI(TAG, "toegangspunt %s staat aan", AP_SSID);
}

int net_scan(char names[][33], int max)
{
    wifi_scan_config_t sc = { .show_hidden = false };
    if (esp_wifi_scan_start(&sc, true) != ESP_OK) return 0;
    uint16_t n = 24;
    wifi_ap_record_t recs[24];
    if (esp_wifi_scan_get_ap_records(&n, recs) != ESP_OK) return 0;
    int k = 0;
    for (int i = 0; i < n && k < max; i++) {
        if (!recs[i].ssid[0]) continue;
        bool dup = false;
        for (int j = 0; j < k; j++) dup |= !strcmp(names[j], (char *)recs[i].ssid);
        if (!dup) strlcpy(names[k++], (char *)recs[i].ssid, 33);
    }
    return k;
}
