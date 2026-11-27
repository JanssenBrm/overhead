// Overhead-scherm: gedeelde declaraties.
#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

#define APP_W 1024
#define APP_H 600
#define AP_SSID "Overhead-scherm"
#define DEFAULT_URL CONFIG_OVERHEAD_DEFAULT_URL

// Ingebedde schermen (main/screens/*.jpg)
extern const uint8_t start_jpg_start[] asm("_binary_start_jpg_start");
extern const uint8_t start_jpg_end[] asm("_binary_start_jpg_end");
extern const uint8_t setup_jpg_start[] asm("_binary_setup_jpg_start");
extern const uint8_t setup_jpg_end[] asm("_binary_setup_jpg_end");
extern const uint8_t offline_jpg_start[] asm("_binary_offline_jpg_start");
extern const uint8_t offline_jpg_end[] asm("_binary_offline_jpg_end");

// display.c
esp_err_t display_init(void);
void display_brightness(int percent);
uint8_t *display_jpeg_buffer(size_t *capacity);   // invoerbuffer voor de jpg-decoder
esp_err_t display_show_jpeg(const uint8_t *jpg, size_t len); // jpg tonen (kopieert naar de invoerbuffer als nodig)
esp_err_t display_show_buffer(size_t len);       // jpg in display_jpeg_buffer() tonen
void display_level(int level, int levels);       // balk voor de helderheid over het beeld
void display_redraw(void);                       // laatste beeld opnieuw tonen (balk weg)

// touch.c
esp_err_t touch_init(void);
int touch_read(int *x, int *y);

// settings.c (NVS)
typedef struct {
    char ssid[33];
    char pass[65];
    char url[256];
} settings_t;
void settings_load(settings_t *s);
esp_err_t settings_save(const settings_t *s);
esp_err_t settings_forget_wifi(void);
int settings_get_int(const char *key, int def);
void settings_set_int(const char *key, int v);

// net.c
esp_err_t net_init(void);
void net_connect(const char *ssid, const char *pass);
bool net_wait_connected(int timeout_ms);
bool net_connected(void);
void net_start_ap(void);
int net_scan(char names[][33], int max);   // zichtbare netwerken, sterkste eerst

// portal.c
void portal_start(void);

// improv.c (wifi instellen via de installatiepagina in de browser)
void improv_start(void);
void improv_set_state(int state, const char *url);

// ota.c
void ota_check(const char *frame_url);
