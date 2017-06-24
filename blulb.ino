

#include <EEPROM.h>
#include <FastLED.h>


#define DATA_PIN    A0
#define CLOCK_PIN   5
#define COLOR_ORDER BGR
#define CHIPSET     APA102
#define APA_MHZ 4
#define LED_SETTINGS CHIPSET, DATA_PIN, CLOCK_PIN, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)

#define EEPROM_START_POINTER_ADDR 0x0

#define NUM_LEDS    50

CRGB leds[NUM_LEDS];

int eepromStart;

//! Len bright mode hue sat c1 c2 c3 c4 chk 
struct SavedSettings {
  byte brightness;
  byte mode;
  byte hue;
  byte saturation;
};
SavedSettings settings;

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(500);

  pinMode(DATA_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  FastLED.addLeds<LED_SETTINGS>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(BINARY_DITHER);
  FastLED.setBrightness(0);
  fill_solid(leds, NUM_LEDS, 0);
  FastLED.show();         

  // Initialize eepromStart: the address where we start writing our settings.
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  // Initialize settings
  EEPROM.get(eepromStart, settings);
}


void loop() {
  checkSerial();
  FastLED.show();

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
  Serial.println("found !");
  byte len;
  if (!Serial.readBytes(&len, 1)) {
    Serial.println("no len");
  }
  Serial.print("len=");
  Serial.println(len);
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
  Serial.println(settings.saturation);

  // We have new settings! Apply them.
  restoreFromSettings();
}

void restoreFromSettings() {
  FastLED.setBrightness(settings.brightness);
  if (settings.mode == 'C') {
    fill_solid(leds, NUM_LEDS, CHSV(settings.hue, settings.saturation, 255));
  } else {
    Serial.print("Unknown mode: ");
    Serial.println((char)settings.mode);
  }
}

