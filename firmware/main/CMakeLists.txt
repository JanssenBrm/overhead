idf_component_register(
    SRCS "main.c" "display.c" "touch.c" "settings.c" "net.c" "portal.c" "improv.c" "ota.c"
    INCLUDE_DIRS "."
    REQUIRES esp_lcd esp_lcd_ek79007 esp_driver_jpeg esp_driver_ledc esp_driver_gpio esp_driver_i2c esp_driver_uart
             nvs_flash esp_netif esp_event esp_wifi esp_http_client esp_http_server esp_https_ota app_update
             mbedtls esp_timer lwip
    EMBED_FILES "screens/start.jpg" "screens/setup.jpg" "screens/offline.jpg")
