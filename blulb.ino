

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

#define NUM_LEDS    50
#define WIDTH       6
#define HEIGHT      (NUM_LEDS / WIDTH)

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
  pinMode(DATA_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  FastLED.addLeds<LED_SETTINGS>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(BINARY_DITHER);
  // Turn everything off at first to avoid buggy lingering data on the chips
  FastLED.setBrightness(0);
  FastLED.show();         

  // Initialize eepromStart: the address where we start writing our settings.
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  // Initialize settings
  EEPROM.get(eepromStart, settings);
  // Re-apply saved settings
  restoreFromSettings();
  // Make sure we won't save unless we get new settings
  saveTarget = 0;

  // Initialize serial connection to bluetooth chip
  Serial.begin(115200);
  // Only wait 500ms for new data before giving up on a command
  Serial.setTimeout(500);
}


void loop() {
  checkSerial();
  checkSave();
  FastLED.show();
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

  Serial.print("settings now: ");
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
  Serial.println(settings.c2);

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
    Serial.println("SAVED!");
  }
}

void restoreFromSettings() {
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
    // START HERE: Movement command. c1 is speed 0-100, c2 is size 0-100 if vertical, 101-201 if horizontal
  } else {
    Serial.print("Unknown mode: ");
    Serial.println((char)settings.mode);
  }
}

