

#include <EEPROM.h>
#include <FastLED.h>

// These settings change per project!
#define NUM_LEDS    18
#define BASE_WIDTH  1
// If true, adds 1 to BASE_WIDTH for every other row
#define STAGGERED   false

// Only change these settings if you're wired to different pins, using a non-APA102 chipset,
// using a different COLOR_ORDER for RGB, etc.
#define DATA_PIN_0    A0
#define DATA_PIN_1    A1
#define CLOCK_PIN_0   5
#define CLOCK_PIN_1   4
#define COLOR_ORDER BGR
#define CHIPSET     APA102
#define APA_MHZ 4
#define LED_SETTINGS_0 CHIPSET, DATA_PIN_0, CLOCK_PIN_0, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)
#define LED_SETTINGS_1 CHIPSET, DATA_PIN_1, CLOCK_PIN_1, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)
/* For LPD8806:
#define COLOR_ORDER BRG
#define CHIPSET     LPD8806
#define LED_SETTINGS_0 CHIPSET, CLOCK_PIN_0, DATA_PIN_0, COLOR_ORDER
#define LED_SETTINGS_1 CHIPSET, CLOCK_PIN_1, DATA_PIN_0, COLOR_ORDER
 */


// EVERYTHING BELOW HERE WON'T CHANGE FOR A NORMAL PROJECT.


#define EEPROM_SAVE_TIMEOUT_MS 5000
#define EEPROM_START_POINTER_ADDR 0x0

CRGB leds[NUM_LEDS];

// Calculate max number of frames we can store in SRAM
#define SRAM_SIZE 2048
// Assume we need this much for everything else
#define VAR_ALLOWANCE 600
#define MAX_FRAMES ((SRAM_SIZE - VAR_ALLOWANCE) / NUM_LEDS)

int width;
int height;
int eepromStart;
long saveTarget;

//! Len bright mode hue sat c1 c2 c3 c4 chk 
struct SavedSettings {
  byte brightness;
  byte mode;
  byte hue;
  byte saturation;
  byte c1;
  byte c2;
};
SavedSettings settings;

// Stored frames of POV/light-painting image, used by mode 'P'
// Each pixel is in 8-bit RRRGGGBB format
byte ledFrames[NUM_LEDS * MAX_FRAMES];

void setup() {
  // Initialize serial connection to bluetooth chip
  Serial.begin(115200);
  // Only wait 500ms for new data before giving up on a command
  Serial.setTimeout(500);
  
  pinMode(DATA_PIN_0, OUTPUT);
  pinMode(CLOCK_PIN_0, OUTPUT);
  pinMode(DATA_PIN_1, OUTPUT);
  pinMode(CLOCK_PIN_1, OUTPUT);
  FastLED.addLeds<LED_SETTINGS_0>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.addLeds<LED_SETTINGS_1>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(BINARY_DITHER);
  // Turn everything off at first to avoid buggy lingering data on the chips
  FastLED.setBrightness(0);
  FastLED.show();

  int logical_num_leds;
  if (STAGGERED) {
    // Because they're staggered, logical width is twice plus one.
    // Every other pixel is imaginary.
    width = BASE_WIDTH * 2 + 1;
    // Need to multiply this so the height calculation works out.
    logical_num_leds = NUM_LEDS * 2;
  } else {
    // Normal width is fine here.
    width = BASE_WIDTH;
    logical_num_leds = NUM_LEDS;
  }
  // Add extra row if there's a remainder.
  height = logical_num_leds / width + (logical_num_leds % width ? 1 : 0);
  /*Serial.print(width);
  Serial.print('x');
  Serial.println(height);*/


  // Should be first time only: Write a valid eepromStart address
  EEPROM.put(EEPROM_START_POINTER_ADDR, 0x2);
  // Initialize eepromStart: the address where we start writing our settings.
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  // Initialize settings
  EEPROM.get(eepromStart, settings);
  // Re-apply saved settings
  restoreFromSettings();
  // Make sure we won't save unless we get new settings
  saveTarget = 0;

  /*
  FastLED.setBrightness(255);
  fill_solid(leds, NUM_LEDS, 0xFF0000);
  FastLED.delay(1000);
  Serial.println(F("did the thing"));
  fill_solid(leds, NUM_LEDS, 0x00FF00);
  FastLED.delay(1000);
  Serial.println(F("yep"));
  fill_solid(leds, NUM_LEDS, 0x0000FF);
  FastLED.delay(1000);
  Serial.println(F("done"));
  fill_solid(leds, NUM_LEDS, 0x000000);
  FastLED.delay(1000);
  Serial.println(F("clear"));
  */
}


void loop() {
  runMode();
  FastLED.show();
  checkSerial();
  checkSave();
}


void setAt(byte x, byte y, CRGB color) {
  if (STAGGERED) {
    
  } else {
    if (x + y * width < NUM_LEDS) {
      leds[x + y * width] = color;
    }
  }
}
void fillRow(byte row, CRGB color) {
  if (STAGGERED) {
    byte start = row * width / 2;
    byte num = width / 2;
    if (row % 2) {
      start += 1;
    } else {
      num += 1;
    }
    if (start + num > NUM_LEDS) {
      num = NUM_LEDS - start;
    }
    fill_solid(leds + start, num, color);
  } else {
    for (byte j = 0; j < width; j++) {
      if (row * width + j < NUM_LEDS) {
        leds[row * width + j] = color; 
      }
    }
  }
}
void fillCol(byte col, CRGB color) {
  if (STAGGERED) {
    for (byte i = col / 2 + (col % 2) * (BASE_WIDTH + 1);
         i < NUM_LEDS; i += width) {
      leds[i] = color;
    }
  } else {
    for (byte j = col; j < NUM_LEDS; j+= width) {
      leds[j] = color;
    }
  }
}

void sendSeparately(byte* buf, int len) {
  // Flush any existing sending,
  Serial.flush();
  // wait a while for that to go through,
  delay(100);
  // and send what should be a new blob.
  Serial.write(buf, len);
}

void checkSerial() {
  // No serial to consume; stop.
  if (!Serial.available()) {
    return;
  }
  if (!Serial.find("!")) {
    Serial.println(F("no !"));
    return;
  }
  //Serial.println("found !");
  byte len;
  if (!Serial.readBytes(&len, 1)) {
    Serial.println(F("no len"));
  }
  //Serial.print(F("len="));
  //Serial.println(len);
  if (!len) {
    // Special case: no length means primary is asking a question.
    byte question;
    if (!Serial.readBytes(&question, 1)) {
      Serial.println(F("no question"));
    } else {
      if (question == 'D') {
        // Send dimensions.
        byte dims[] = { '!', 'D', width, height, NUM_LEDS, MAX_FRAMES };
        sendSeparately(dims, sizeof(dims));
      }
    }
    return;
  }

  SavedSettings previous = settings;
  if (!Serial.readBytes((byte*)&settings, min(sizeof(settings), len))) {
    Serial.println(F("failed to read len bytes"));
    settings = previous;
    return;
  }
  if (settings.mode == 'P') {
    // hue means number of frames in this case
    settings.hue = min(settings.hue, MAX_FRAMES);
    if (settings.hue) {
      if (!Serial.readBytes(ledFrames, settings.hue * NUM_LEDS)) {
        Serial.print(F("failed to read "));
        Serial.print(settings.hue);
        Serial.println(F(" image frames"));
        settings = previous;
      }
    } else if (previous.mode == 'P') {
      // Special case: frame count of 0 means no frames sent.
      // The mode must have already been 'P' for this to work.
      settings.hue = previous.hue;
    } else {
      Serial.println("Can't modify frame timing without image frames first");
      settings = previous;
    }
  }

  /*Serial.print(len);
  Serial.print(F(" -> "));*/
  // We have new settings! Apply them.
  restoreFromSettings();
  // Plan to save this if we don't get any more data
  saveTarget = millis() + EEPROM_SAVE_TIMEOUT_MS;
}

void checkSave() {
  // Save settings to EEPROM if we have a target and we've hit it
  if (saveTarget && millis() >= saveTarget &&
      // Special case: pixel mode only works in volatile memory
      settings.mode != 'P') {
    // Uses update() so only rewrites if necessary
    EEPROM.put(eepromStart, settings);
    saveTarget = 0;
    //Serial.println(F("SAVED!"));
  }
}

void restoreFromSettings() {
  /*Serial.print(F("settings: "));
  Serial.print(settings.brightness);
  Serial.print(',');
  Serial.print(settings.mode);
  Serial.print(',');
  Serial.print(settings.hue);
  Serial.print(',');
  Serial.print(settings.saturation);
  Serial.print(',');
  Serial.print(settings.c1);
  Serial.print(',');
  Serial.println(settings.c2);*/
  
  FastLED.setBrightness(settings.brightness);
  if (settings.mode == 'C') {
    fill_solid(leds, NUM_LEDS, CHSV(settings.hue, settings.saturation, 255));
  } else if (settings.mode == 'R') {
    byte delta = settings.saturation >> 4;
    if (!delta) {
      // deltahue=0 doesn't work so ensure at least 1
      delta = 1;
    }
    fill_rainbow(leds, NUM_LEDS, settings.hue, delta);
  } else if (settings.mode == 'M') {
    runMovement(true);
  } else if (settings.mode == 'P') {
    runPixels(true);
  } else {
    Serial.print(F("Unknown mode: "));
    Serial.println(settings.mode);
  }
}

void runMode() {
  if (settings.mode == 'M') {
    runMovement(false);
  } else if (settings.mode == 'P') {
    runPixels(false);
  }
}

float mapRange(float from,
              float fromLow, float fromHigh,
              float toLow, float toHigh) {
  return toLow + (from-fromLow) / (fromHigh-fromLow) * (toHigh-toLow);
}

void runMovement(bool initialize) {
  static bool rainbow;
  static bool horizontal;
  // Making this a float simplifies other math
  static float dimension;
  static float speed;
  static float size;
  static float position = 0;
  static long lastFrame;
  if (initialize) {
    // c1 is speed 0-100 if normal, 101-201 if rainbow;
    // c2 is size 0-100 if vertical, 101-201 if horizontal
    rainbow = settings.c1 > 100;
    horizontal = settings.c2 > 100;
    dimension = horizontal ? width : height;
    speed = float(int(rainbow ? settings.c1 - 101 : settings.c1) - 50) / 1000.0;
    // First convert size to [0,100]
    size = horizontal ? settings.c2 - 101 : settings.c2;
    if (rainbow) {
      // "size" isn't really true here
      //size = (size / 100.0 * 256.0 / dimension * 2.0);
      size = mapRange(size, 0, 100, 1, 256.0 / dimension * 2.0);
    } else {
      size = mapRange(size, 0, 100, 2, dimension - 2);
    }
  } else {
    float frameTime = millis() - lastFrame;
    position += speed * frameTime;
  }
  // Correct position if it's out of bounds.
  // Do this outside of the += above because it could
  // also be out of bounds due to a horizontal/vertical change.
  while (position < 0) {
    position += dimension;
  }
  while (position >= dimension) {
    position -= dimension;
  }
  // Draw the current situation.
  for (byte i = 0; i < dimension; i++) {
    float distance = min(
      abs(float(i) - position),
      (i < dimension / 2) ?
        abs(float(i) - position + dimension) :
        abs(float(i) - position - dimension));
    CRGB color;
    if (rainbow) {
      color = CHSV(int(float(settings.hue) + distance * size) % 256, settings.saturation, 255);
    } else {
      byte value;
      float intensity = size / 2.0 - distance;
      float moveFadeDist = 0.5;
      if (intensity > moveFadeDist) {
        value = 255;
      } else if (intensity > -moveFadeDist) {
        value = 255.0 * (intensity + moveFadeDist);
      } else {
        value = 0;
      }
      color = CHSV(settings.hue, settings.saturation, value);
    }

    if (horizontal) {
      fillCol(i, color);    
    } else {
      fillRow(i, color);
    }
  }
  
  // Remember when this frame happened.
  lastFrame = millis();
}

void runPixels(bool initialize) {
  static byte frame;
  static long target_us;
  if (initialize) {
    frame = 0;
  }
  if (initialize || micros() >= target_us) {
    for (byte i = 0; i < NUM_LEDS; i++) {
      byte color = ledFrames[frame * NUM_LEDS + i];
      leds[i] = CRGB(
        ((color & 0b11100000) >> 5) * 36,
        ((color & 0b00011100) >> 2) * 36,
        ((color & 0b00000011) >> 0) * 85
      );
    }
    frame = (frame + 1) % settings.hue;
    target_us = micros() + long(settings.saturation) * 100;
  }
}



