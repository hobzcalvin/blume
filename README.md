# Blume
Blume is a platform for LED projects. It combines the [ESP32](http://esp32.net/), a cheap Bluetooth- and WiFi-enabled [Arduino](https://www.arduino.cc/)-compatible microprocessor, with a cross-platform [Cordova](https://cordova.apache.org/) app. This app lets you control LEDs connected to the device with any smartphone or tablet. See the [browser-based demo](http://hobzcalvin.github.io/blume) or download the app from the [iOS App Store](https://itunes.apple.com/us/app/blume-led/id1288248844) or [Android Play Store](https://play.google.com/store/apps/details?id=org.selfobserved.blume). [Demo video](https://www.youtube.com/watch?v=mlmkiE1C7wY).

## Running the App
- Install [npm](https://www.npmjs.com/) if you don't have it
- `npm install -g cordova`
- From inside this repository: `cd cordova/www/`
- `cordova prepare`
- `cordova run ios` (or `android`, etc.)

## Running the Arduino Code
*NOTE:* These instructions are for the [Bluno Beetle by DFRobot](https://www.dfrobot.com/wiki/index.php/Bluno_Beetle_SKU:DFR0339), which was used in earlier versions of the software. The setup is mostly the same but you'll need to install the [ESP32 Arduino Core](https://github.com/espressif/arduino-esp32) and choose the ESP32 Board/Port accordingly.
- Install the latest [Arduino IDE](http://arduino.cc/en/Main/Software)
- Open `blume.ino`
- Under `Tools > Board` choose `Arduino/Genuino Uno`
- Under `Tools > Port` it's something like `/dev/cu.usbmodem1411` on macOS or whichever one identifies as `Arduino/Genuino Uno`
- Default settings for `DATA_PIN_0`, `CLOCK_PIN_0`, etc. should work if you're using the recommended wiring layout and APA102 LEDs. Refer to [FastLED](http://fastled.io/)'s documentation to use other LED chipsets etc.
- Change `NUM_LEDS`, `BASE_WIDTH`, `STAGGERED`, and `ZIGZAG` to suit your project.
  - The code currently assumes that projects with `BASE_WIDTH` greater than 1 are using flexible LED strips wrapped around an object, and `BASE_WIDTH` is the number of LEDs per "wrap".
  - If the LEDs of one wrap are offset from the LEDs above and below, setting `STAGGERED` to true will account for this alignment, adding 1 to `BASE_WIDTH` for every other row. 
  - `ZIGZAG` should be set true if your LEDs are arranged in rows like a snake, where the direction of data alternates each row.
- Upload code to board

## TODO
- Investigate over-air programming options
- Add "locking" so a Blume can be "paired" with and only accessed by a certain app instance, or passphrase, etc.
- Some new modes:
  - 2 or 3-color palette mode
  - "Sparkle" ("random" is the start of this)
  - Text to POV
  - Monochrome POV with color setting after data is sent
  - Full-color POV? Very limited frame storage available...
- Make a custom board that works even better with LEDs
- Develop for other bluetooth-enabled Arduinos
- Evaluate/refactor [easyble](https://evothings.com/doc/lib-doc/evothings.easyble.html) and other [Evothings](http://evothings.com/) remnants (a bit one-size-fits-all)
