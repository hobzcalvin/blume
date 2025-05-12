# Blume LED Controller

A flexible LED controller for ESP32 that supports Bluetooth Low Energy (BLE) communication and various LED patterns.

## Features

- BLE control interface
- Support for WS2812/APA102 LED strips
- Multiple display modes and patterns
- Text display mode
- Demo mode with saved presets
- Configurable dimensions and LED layout

## Hardware Requirements

- ESP32 development board
- WS2812 or APA102 LED strips
- Power supply (5V, sufficient for your LED count)

## Software Setup

### Option 1: Using PlatformIO (Recommended)

1. Install [PlatformIO](https://platformio.org/install)
2. Clone this repository
3. Open the project in PlatformIO
4. Build and upload to your ESP32

### Option 2: Using Arduino IDE

1. Install [Arduino IDE](https://www.arduino.cc/en/software)
2. Install ESP32 board support:
   - Open Arduino IDE
   - Go to File > Preferences
   - Add `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json` to Additional Boards Manager URLs
   - Go to Tools > Board > Boards Manager
   - Search for "esp32" and install "ESP32 by Espressif Systems"
3. Install required libraries:
   - FastLED (3.6.0 or later)
   - Adafruit GFX Library (1.11.5 or later)
   - Adafruit BusIO (1.14.1 or later)
4. Open `blume.ino` in Arduino IDE
5. Select your ESP32 board from Tools > Board
6. Build and upload

## Configuration

The project can be configured through build flags in `platformio.ini` or by modifying the defines in the code:

- `WIDTH` and `HEIGHT`: Physical dimensions of your LED matrix
- `NUM_LEDS`: Total number of LEDs
- `CHIPSET`: LED type (WS2812 or APA102)
- `DATA_PIN_0`, `DATA_PIN_1`, `CLOCK_PIN_0`, `CLOCK_PIN_1`: Pin assignments
- `MAX_MILLIAMPS`: Maximum current draw
- `BLUETOOTH_NAME`: Name of the BLE device

## Usage

1. Power on the ESP32
2. Connect to the BLE device named "Blume" (or your configured name)
3. Send commands through the BLE interface:
   - `!D`: Request dimensions
   - `!d`: Demo mode commands
   - Other commands as documented in the code

## License

[Add your license information here]
