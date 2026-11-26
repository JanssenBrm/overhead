// Instellingen in NVS: wifi en het adres van het beeld.
#include <string.h>
#include "app.h"
#include "nvs.h"

void settings_load(settings_t *s)
{
    memset(s, 0, sizeof(*s));
    strlcpy(s->url, DEFAULT_URL, sizeof(s->url));
    nvs_handle_t h;
    if (nvs_open("overhead", NVS_READONLY, &h) != ESP_OK) return;
    size_t n = sizeof(s->ssid);
    nvs_get_str(h, "ssid", s->ssid, &n);
    n = sizeof(s->pass);
    nvs_get_str(h, "pass", s->pass, &n);
    n = sizeof(s->url);
    if (nvs_get_str(h, "url", s->url, &n) != ESP_OK || !s->url[0]) strlcpy(s->url, DEFAULT_URL, sizeof(s->url));
    nvs_close(h);
}

esp_err_t settings_save(const settings_t *s)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open("overhead", NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    nvs_set_str(h, "ssid", s->ssid);
    nvs_set_str(h, "pass", s->pass);
    nvs_set_str(h, "url", s->url);
    err = nvs_commit(h);
    nvs_close(h);
    return err;
}

esp_err_t settings_forget_wifi(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open("overhead", NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    nvs_erase_key(h, "ssid");
    nvs_erase_key(h, "pass");
    err = nvs_commit(h);
    nvs_close(h);
    return err;
}
