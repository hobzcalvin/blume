

#include <EEPROM.h>
#include <FastLED.h>


#define DATA_PIN    A0
#define CLOCK_PIN   5
#define COLOR_ORDER BGR
#define CHIPSET     APA102
#define APA_MHZ 4
#define LED_SETTINGS CHIPSET, DATA_PIN, CLOCK_PIN, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)

#define EEPROM_SAVE_TIMEOUT_MS 5000
#define EEPROM_START_POINTER_ADDR 0x0

#define NUM_LEDS    40
#define WIDTH       6
// Add 1 if there's a remainder to pretend there's one last full row.
#define HEIGHT      (NUM_LEDS / WIDTH + (NUM_LEDS % WIDTH ? 1 : 0))


CRGB leds[NUM_LEDS];

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

void setup() {
  // Initialize serial connection to bluetooth chip
  Serial.begin(115200);
  // Only wait 500ms for new data before giving up on a command
  Serial.setTimeout(500);
  
  pinMode(DATA_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  FastLED.addLeds<LED_SETTINGS>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(BINARY_DITHER);
  // Turn everything off at first to avoid buggy lingering data on the chips
  FastLED.setBrightness(0);
  FastLED.show();

  // FIRST TIME ONLY: Write a valid eepromStart address
  //EEPROM.put(EEPROM_START_POINTER_ADDR, 0x2);

  // Initialize eepromStart: the address where we start writing our settings.
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  // Initialize settings
  EEPROM.get(eepromStart, settings);
  // Re-apply saved settings
  restoreFromSettings();
  // Make sure we won't save unless we get new settings
  saveTarget = 0;
}


void loop() {
  runMode();
  FastLED.show();
  checkSerial();
  checkSave();
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
    Serial.println("no !");
    return;
  }
  //Serial.println("found !");
  byte len;
  if (!Serial.readBytes(&len, 1)) {
    Serial.println("no len");
  }
  //Serial.print("len=");
  //Serial.println(len);
  if (!len) {
    // Special case: no length means primary is asking a question.
    byte question;
    if (!Serial.readBytes(&question, 1)) {
      Serial.println("no question");
    } else {
      if (question == 'D') {
        // Send dimensions.
        byte dims[] = { '!', 'D', WIDTH, HEIGHT, NUM_LEDS };
        sendSeparately(dims, sizeof(dims));
      }
    }
    return;
  }
  
  if (!Serial.readBytes((byte*)&settings, min(sizeof(settings), len))) {
    Serial.println("failed to read len bytes");
    return;
  }

  /*Serial.print(len);
  Serial.print(" -> ");*/
  // We have new settings! Apply them.
  restoreFromSettings();
  // Plan to save this if we don't get any more data
  saveTarget = millis() + EEPROM_SAVE_TIMEOUT_MS;
}

void checkSave() {
  // Save settings to EEPROM if we have a target and we've hit it
  if (saveTarget && millis() >= saveTarget) {
    // Uses update() so only rewrites if necessary
    EEPROM.put(eepromStart, settings);
    saveTarget = 0;
    //Serial.println("SAVED!");
  }
}

void restoreFromSettings() {
  /*Serial.print("settings: ");
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
  } else {
    Serial.print("Unknown mode: ");
    Serial.println(char(settings.mode));
  }
}

void runMode() {
  if (settings.mode == 'M') {
    runMovement(false);
  }
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
    dimension = horizontal ? WIDTH : HEIGHT;
    speed = float(int(rainbow ? settings.c1 - 101 : settings.c1) - 50) / 1000.0;
    // First convert size to [0,100]
    size = horizontal ? settings.c2 - 101 : settings.c2;
    if (rainbow) {
      // "size" isn't really true here
      size = (size / 100.0 * 256.0 / dimension * 2.0);
    } else {
      size = dimension * (size / 280.0 + 0.15);
    }

    /*
    Serial.print("movementInit: ");
    Serial.print(rainbow);
    Serial.print(',');
    Serial.print(horizontal);
    Serial.print(',');
    Serial.print(dimension);
    Serial.print(',');
    Serial.print(speed, 5);
    Serial.print(',');
    Serial.println(size);*/
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
      float intensity = (size - distance) / 2.0;
      float moveFadeDist = 0.5; // 0.5 good for bigger
      if (intensity > moveFadeDist) {
        value = 255;
      } else if (intensity > 0) {
        value = 255.0 * intensity / moveFadeDist;
      } else {
        value = 0;
      }
      /*if (initialize) {
        Serial.print("First: ");
        Serial.print(i);
        Serial.print(',');
        Serial.print(distance);
        Serial.print(',');
        Serial.print(intensity);
        Serial.print(',');
        Serial.println(value);
      }*/
      color = CHSV(settings.hue, settings.saturation, value);
    }

    if (horizontal) {
      for (byte j = i; j < NUM_LEDS; j+= WIDTH) {
        leds[j] = color;
      }
    } else {
      for (byte j = 0; j < WIDTH; j++) {
        if (i * WIDTH + j < NUM_LEDS) {
          leds[i * WIDTH + j] = color; 
        }
      }
    }
  }
  
  // Remember when this frame happened.
  lastFrame = millis();
}



