# Blume
Blume is a platform for LED projects. It combines [Bluno Beetle by DFRobot](https://www.dfrobot.com/wiki/index.php/Bluno_Beetle_SKU:DFR0339), a cheap bluetooth-enabled [Arduino](https://www.arduino.cc/) clone, with a cross-platform [Cordova](https://cordova.apache.org/) app. This app lets you control LEDs connected to the Beetle with any smartphone or tablet. See the [browser-based demo](hobzcalvin.github.io/blume) or download the app from the [iOS App Store](https://itunes.apple.com/us/app/blume-led/id1288248844) or [Android Play Store](https://play.google.com/store/apps/details?id=org.selfobserved.blume).

## Running the App
- Install [npm](https://www.npmjs.com/) if you don't have it
- `npm install -g cordova`
- From inside this repository: `cd cordova/www/`
- `cordova prepare`
- `cordova run ios` (or `android`, etc.)

## Running the Arduino Code
- Install the latest [Arduino IDE](http://arduino.cc/en/Main/Software)
- Open `blume.ino`
- Under `Tools > Board` choose `Arduino/Genuino Uno`
- Under `Tools > Port` it's something like `/dev/cu.usbmodem1411` on macOS or whichever one identifies as `Arduino/Genuino Uno`
- Default settings for `DATA_PIN_0`, `CLOCK_PIN_0`, etc. should work if you're using the recommended wiring layout and APA102 LEDs. Refer to [FastLED](http://fastled.io/)'s documentation to use other LED chipsets etc.
- Change `NUM_LEDS`, `BASE_WIDTH`, `STAGGERED`, and `ZIGZAG` to suit your project.
 - The code currently assumes that projects with `BASE_WIDTH` greater than 1 are using flexible LED strips wrapped around an object, and `BASE_WIDTH` is the number of LEDs per "wrap".
 - If the LEDs of one wrap are offset from the LEDs above and below, setting `STAGGERED` to true will account for this alignment, adding 1 to `BASE_WIDTH` for every other row. 
 - `ZIGZAG` should be set true if your LEDs are arranged in rows like a snake, where the direction of data alternates each row.
- Upload code to Beetle

## TODO
- Develop for other bluetooth-enabled Arduinos
- Evaluate/refactor [easyble](https://evothings.com/doc/lib-doc/evothings.easyble.html) and other [Evothings](http://evothings.com/) remnants (a bit one-size-fits-all)
