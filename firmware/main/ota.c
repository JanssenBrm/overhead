// Updates over wifi: het scherm kijkt elk uur naar /fw/<variant>/version.txt op de site. Is er een nieuwere
// versie, dan vraagt het op het scherm of ze geïnstalleerd mag worden. Gaat er iets mis, dan start de vorige versie.
#include <string.h>
#include <stdlib.h>
#include "app.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_crt_bundle.h"

static const char *TAG = "ota";

// https://host/api/frame?... -> https://host
static void origin(const char *url, char *out, size_t cap)
{
    const char *p = strstr(url, "://");
    p = p ? p + 3 : url;
    const char *slash = strchr(p, '/');
    size_t n = slash ? (size_t)(slash - url) : strlen(url);
    if (n >= cap) n = cap - 1;
    memcpy(out, url, n);
    out[n] = 0;
}

// Vergelijk "1.2.3" met "1.10.0"
static int vcmp(const char *a, const char *b)
{
    for (int i = 0; i < 3; i++) {
        long x = strtol(a, (char **)&a, 10), y = strtol(b, (char **)&b, 10);
        if (x != y) return x < y ? -1 : 1;
        if (*a == '.') a++;
        if (*b == '.') b++;
    }
    return 0;
}

// Is er een nieuwere versie? Zo ja: true en het versienummer in out.
bool ota_available(const char *frame_url, char *out, size_t cap)
{
    char base[160], url[220], remote[24] = "";
    origin(frame_url, base, sizeof(base));
    snprintf(url, sizeof(url), "%s/fw/%s/version.txt", base, CONFIG_OVERHEAD_VARIANT);
    esp_http_client_config_t c = { .url = url, .crt_bundle_attach = esp_crt_bundle_attach, .timeout_ms = 10000 };
    esp_http_client_handle_t h = esp_http_client_init(&c);
    if (esp_http_client_open(h, 0) == ESP_OK && esp_http_client_fetch_headers(h) >= 0 &&
        esp_http_client_get_status_code(h) == 200) {
        int n = esp_http_client_read(h, remote, sizeof(remote) - 1);
        remote[n > 0 ? n : 0] = 0;
        remote[strcspn(remote, "\r\n ")] = 0;
    }
    esp_http_client_cleanup(h);
    if (!remote[0]) { ESP_LOGW(TAG, "geen versie gevonden op %s", url); return false; }
    if (vcmp(remote, CONFIG_OVERHEAD_VERSION) <= 0) { ESP_LOGI(TAG, "up-to-date (%s)", CONFIG_OVERHEAD_VERSION); return false; }
    ESP_LOGI(TAG, "nieuwe versie %s beschikbaar (nu %s)", remote, CONFIG_OVERHEAD_VERSION);
    strlcpy(out, remote, cap);
    return true;
}

// Installeert de nieuwe versie en herstart. Geeft alleen terug als het mislukt.
esp_err_t ota_install(const char *frame_url, void (*progress)(int percent))
{
    char base[160], url[220];
    origin(frame_url, base, sizeof(base));
    snprintf(url, sizeof(url), "%s/fw/%s/overhead.bin", base, CONFIG_OVERHEAD_VARIANT);
    esp_http_client_config_t bc = { .url = url, .crt_bundle_attach = esp_crt_bundle_attach, .timeout_ms = 30000, .buffer_size = 4096 };
    esp_https_ota_config_t oc = { .http_config = &bc };
    esp_https_ota_handle_t h = NULL;
    esp_err_t err = esp_https_ota_begin(&oc, &h);
    if (err != ESP_OK) { ESP_LOGE(TAG, "update starten mislukt: %s", esp_err_to_name(err)); return err; }
    int total = esp_https_ota_get_image_size(h), last = -1;
    while ((err = esp_https_ota_perform(h)) == ESP_ERR_HTTPS_OTA_IN_PROGRESS) {
        int done = esp_https_ota_get_image_len_read(h);
        int pct = total > 0 ? (int)((int64_t)done * 100 / total) : 0;
        if (progress && pct != last) { progress(pct); last = pct; }
    }
    if (err == ESP_OK && esp_https_ota_is_complete_data_received(h)) {
        if (progress) progress(100);
        err = esp_https_ota_finish(h);
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "geïnstalleerd, herstarten");
            esp_restart();
        }
    } else {
        esp_https_ota_abort(h);
    }
    ESP_LOGE(TAG, "update mislukt: %s", esp_err_to_name(err));
    return err == ESP_OK ? ESP_FAIL : err;
}
