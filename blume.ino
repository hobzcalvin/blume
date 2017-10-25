

#include <EEPROM.h>
#include <FastLED.h>

// These settings change per project!
#define NUM_LEDS    72
#define BASE_WID  12
// If true, adds 1 to BASE_WID for every other row
#define STAGGERED false
// Wiring is in a zig-zag pattern.
#define ZIGZAG   false
// Support text mode; currently 6-pixel height only.
#define TEXTMODE true
// POI: 18/1/false/false
// STAFF: 50/1/false/false
// CUCUMBER: 104/6/true/false
// VICTORIA HAT: 28/16/false/false/Clock=2
// CARO THING: 18/1/false/false
// NEHA BULB: 76/6/true/false
// STOPH: 20/1/false/false
// NINA: 18/1/false/false
// TREVOR: 75/6/true/false
// LEIGH BIKE: 80/1/false/false
// VICTORIA OTHER: 71/1/false/false
// NINA OTHER: 56/1/false/false/Clock=2
// BLUME VIVE: 47/6/true/false
// BLUME SCARF: 120/40/false/true
// BLUME DUBIOUS: 60/6/true/false
// BLUME FEATHER: 72/12/false/false

#define DEBUG false

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

#if TEXTMODE
// Include this here because it uses keywords we #define below like "WIDTH" and "HEIGHT"
#include "Adafruit_GFX.h"
#endif


#define EEPROM_SAVE_TIMEOUT_MS 5000
#define EEPROM_START_POINTER_ADDR 0x0

CRGB leds[NUM_LEDS];

// Calculate max number of frames we can store in SRAM
#define SRAM_SIZE 2048
// Assume we need this much for everything else
#define VAR_ALLOWANCE (NUM_LEDS * 3 + 850)
#define MAX_FRAMES (BASE_WID == 1 ? (SRAM_SIZE - VAR_ALLOWANCE) / NUM_LEDS : 0)

#define WIDTH (STAGGERED ? BASE_WID * 2 + 1 : BASE_WID)
#define logical_num_leds (STAGGERED ? NUM_LEDS * 2 : NUM_LEDS)
// Add extra row if there's a remainder.
#define HEIGHT (logical_num_leds / WIDTH + (logical_num_leds % WIDTH ? 1 : 0))
int eepromStart;
long saveTarget;
long lastFrameTime;
float lastFrameDuration;

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

#if TEXTMODE
#include "Picopixel.h"
void setAt(byte x, byte y, CRGB color);
class BlumeGFX : public Adafruit_GFX {
  public:
    BlumeGFX(int16_t w, int16_t h);
    ~BlumeGFX(void);
    void drawPixel(int16_t x, int16_t y, uint16_t color);
    CRGB realColor;
    bool printed;
};
BlumeGFX::BlumeGFX(int16_t w, int16_t h) : Adafruit_GFX(w, h) {
}
BlumeGFX::~BlumeGFX(void) {
}
void BlumeGFX::drawPixel(int16_t x, int16_t y, uint16_t color) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
    return;
  }
  setAt(x, HEIGHT-1-y, realColor);
  printed = true;
}

BlumeGFX gfx = BlumeGFX(WIDTH, HEIGHT);

// Max length 32
char text[32] = "Hello World! I'm Grant.";
void runText(bool initialize) {
  static int pos;
  static long nextShift;
  if (initialize) {
    gfx.setFont(&Picopixel);
    gfx.setTextWrap(false);
    pos = WIDTH;
    nextShift = 0;
  }
  if (!nextShift || millis() >= nextShift) {
    pos--;
    nextShift = millis() + 100;
    gfx.setCursor(pos, 4);
    fill_solid(leds, NUM_LEDS, 0);
    gfx.realColor = 0xFF7F00;
    gfx.printed = false;
    gfx.print(text);
    if (!gfx.printed) {
      pos = WIDTH;
    }
  }
}
#endif

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

#if DEBUG
  FastLED.setBrightness(3);
  fill_solid(leds, NUM_LEDS, 0xFF0000);
  FastLED.delay(500);
  Serial.print(F("Width: "));
  Serial.println(WIDTH);
  fill_solid(leds, NUM_LEDS, 0x00FF00);
  FastLED.delay(500);
  Serial.print(F("Height: "));
  Serial.println(HEIGHT);
  fill_solid(leds, NUM_LEDS, 0x0000FF);
  FastLED.delay(500);
  Serial.print(F("Number of LEDs: "));
  Serial.println(NUM_LEDS);
  fill_solid(leds, NUM_LEDS, 0x000000);
  FastLED.delay(500);
#endif

  // Should be first time only: Write a valid eepromStart address
  EEPROM.put(EEPROM_START_POINTER_ADDR, 0x2);
  // Initialize eepromStart: the address where we start writing our settings.
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  // Re-apply saved settings
  restoreFromSettings(true);
  // Make sure we won't save unless we get new settings
  saveTarget = 0;
  // Initialize lastFrameTime
  lastFrameTime = millis();
}

void doFPS() {
// This is a no-op when DEBUG=false
#if DEBUG
  static byte totalLoops = 0;
  static long totalDurations = 0;
  totalDurations += lastFrameDuration;
  totalLoops++;
  if (totalLoops == 100) {
    Serial.print(F("FPS: "));
    Serial.println((float)totalLoops / (float)totalDurations * 1000.0);
    totalLoops = 0;
    totalDurations = 0;
  }
#endif
}
void loop() {
  lastFrameDuration = millis() - lastFrameTime;
  runMode();
  lastFrameTime = millis();
  FastLED.show();
  checkSerial();
  checkSave();
  doFPS();
}

inline bool isImaginary(byte x, byte y) {
  return x >= WIDTH || y >= HEIGHT || (
    STAGGERED && (x % 2 != y % 2));
}
void setAt(byte x, byte y, CRGB color) {
  if (STAGGERED) {
    if (isImaginary(x, y)) {
      return;
    }
    byte idx = x / 2 + (x % 2) * (BASE_WID + 1) + WIDTH * (y / 2);
    if (idx >= NUM_LEDS) {
      return;
    }
    leds[idx] = color;
  } else {
    byte idx = ((ZIGZAG && y % 2) ? (WIDTH - 1 - x) : x) + y * WIDTH;
    if (idx < NUM_LEDS) {
      leds[idx] = color;
    }
  }
}
void fillRow(byte row, CRGB color) {
  if (STAGGERED) {
    byte start = row * WIDTH / 2;
    byte num = WIDTH / 2;
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
    for (byte j = 0; j < WIDTH; j++) {
      if (row * WIDTH + j < NUM_LEDS) {
        leds[row * WIDTH + j] = color; 
      }
    }
  }
}
void fillCol(byte col, CRGB color) {
  if (ZIGZAG) {
    for (byte i = 0; i < HEIGHT; i++) {
      setAt(col, i, color);
    }
  } else if (STAGGERED) {
    for (byte i = col / 2 + (col % 2) * (BASE_WID + 1);
         i < NUM_LEDS; i += WIDTH) {
      leds[i] = color;
    }
  } else {
    for (byte j = col; j < NUM_LEDS; j+= WIDTH) {
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
        byte dims[] = { '!', 'D', WIDTH, HEIGHT, NUM_LEDS, MAX_FRAMES };
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
      Serial.println(F("Can't modify frame timing without image frames first"));
      settings = previous;
    }
  }

  /*Serial.print(len);
  Serial.print(F(" -> "));*/
  // We have new settings! Apply them.
  if (restoreFromSettings(false)) {
    // Plan to save this if we don't get any more data
    saveTarget = millis() + EEPROM_SAVE_TIMEOUT_MS;
  }
}

void checkSave() {
  // Save settings to EEPROM if we have a target and we've hit it
  if (saveTarget && millis() >= saveTarget &&
      // Special case: pixel mode only works in volatile memory
      settings.mode != 'P') {
    // Uses update() so only rewrites if necessary
    EEPROM.put(eepromStart, settings);
#if TEXTMODE
    if (settings.mode == 'T') {
      EEPROM.put(eepromStart + sizeof(settings), text);
    }
#endif
    saveTarget = 0;
#if DEBUG
    Serial.println(F("SAVED!"));
#endif
  }
}

bool restoreFromSettings(bool loadEeprom) {
  if (loadEeprom) {
    // Initialize settings
    EEPROM.get(eepromStart, settings);
#if TEXTMODE
    if (settings.mode == 'T') {
      EEPROM.get(eepromStart + sizeof(settings), text);
    }
#endif
  }
#if DEBUG
  Serial.print(F("settings: "));
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
#endif
  
  FastLED.setBrightness(settings.brightness);
  if ((settings.mode == 'C' || settings.mode == 'R') &&
      settings.c1 >= 128) {
    runRandom(true);
  } else if (settings.mode == 'C') {
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
  } else if (settings.mode == 'B') {
    runBlobs(true);
  } else if (settings.mode == 'T') {
    runText(true);
  } else {
    Serial.print(F("Unknown mode: "));
    Serial.println(settings.mode);
    return false;
  }
  return true;
}

void runMode() {
  if ((settings.mode == 'C' || settings.mode == 'R') &&
      settings.c1 >= 128) {
    runRandom(false);
  } else if (settings.mode == 'M') {
    runMovement(false);
  } else if (settings.mode == 'P') {
    runPixels(false);
  } else if (settings.mode == 'B') {
    runBlobs(false);
  } else if (settings.mode == 'T') {
    runText(false);
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
  if (initialize) {
    // c1 is speed 0-100 if normal, 101-201 if rainbow;
    // c2 is size 0-100 if vertical, 101-201 if horizontal
    rainbow = settings.c1 > 100;
    horizontal = settings.c2 > 100;
    dimension = horizontal ? WIDTH : HEIGHT;
    speed = float(int(rainbow ? settings.c1 - 101 : settings.c1) - 50) * dimension / 8000.0;
    // First convert size to [0,100]
    size = horizontal ? settings.c2 - 101 : settings.c2;
    if (rainbow) {
      // "size" isn't really true here
      //size = (size / 100.0 * 256.0 / dimension * 2.0);
      size = mapRange(size, 0, 100, 1, 256.0 / dimension * 2.0);
    } else {
      // Bit of a hack to work with dimensions less than 5; otherwise
      // "bigger" may be less than "smaller".
      byte dimRange = dimension < 5 ? 1 : 2;
      size = mapRange(size, 0, 100, dimRange, dimension - dimRange);
    }
  } else {
    position += speed * lastFrameDuration;
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

// Positions should really be bytes, but we're about to do arithmetic with them that wants negative results.
float distance(float pos1, float pos2, float dimensionSize) {
  float distance = abs(pos1 - pos2);
  while (distance > dimensionSize) distance -= dimensionSize;
  if (distance > dimensionSize / 2) {
    distance = dimensionSize - distance;
  }
  return distance;
}

#define RED 0
#define GREEN 1
#define BLUE 2
void runBlobs(bool initialize) {
  static float xPos[] = { (float)WIDTH / 2.0, (float)WIDTH / 2.0, (float)WIDTH / 2.0 };
  static float yPos[] = { (float)HEIGHT / 2.0, (float)HEIGHT / 2.0, (float)HEIGHT / 2.0 };
  static float xIncrement[3];
  static float yIncrement[3];
  static int steps[] = { 0, 0, 0 };
  static float size[3];

  if (initialize) {
    for (byte c = RED; c <= BLUE; c++) {
      // Cancel any pending movements since we may have a new speed
      steps[c] = 0;
      // Initialize size for this blob
      size[c] = mapRange(*(&settings.saturation + c), 0, 255, 0, max(WIDTH, HEIGHT));
    }
  }

  CRGB color;
  // Render the spots.
  for (byte x = 0; x < WIDTH; x++) {
    for (byte y = 0; y < HEIGHT; y++) {
      if (isImaginary(x, y)) {
        continue;
      }
      for (byte c = RED; c <= BLUE; c++) {
        float xDist = distance(x, xPos[c], WIDTH);
        float yDist = distance(y, yPos[c], HEIGHT);
        float dist = sqrt(xDist * xDist + yDist * yDist);
        color[c] = 255.0 * (size[c] - min(size[c], dist)) / size[c];
      }
      setAt(x, y, color);
    }
  }

  // Move the spots.
  // Two-dimensional displays want one of (x,y) to be zero sometimes so
  // the movement isn't always diagonal. One-dimensional displays always want
  // movement in whichever is the meaningful dimension.
  bool allowZero = WIDTH > 1 || HEIGHT > 1;
  for (byte c = RED; c <= BLUE; c++) {
    if (!steps[c]) {
      xIncrement[c] = (float)(random(allowZero ? 0 : WIDTH * settings.hue / 2, WIDTH * settings.hue) + 100) / 10000.0;
      yIncrement[c] = (float)(random(allowZero ? 0 : HEIGHT * settings.hue / 2, HEIGHT * settings.hue) + 100) / 10000.0;
      if (random(2)) {
        xIncrement[c] *= -1;
      }
      if (random(2)) {
        yIncrement[c] *= -1;
      }
      steps[c] = random(10, 50);
    }
    xPos[c] += xIncrement[c] * lastFrameDuration;
    yPos[c] += yIncrement[c] * lastFrameDuration;
    while (xPos[c] > WIDTH) xPos[c] -= WIDTH;
    while (yPos[c] > HEIGHT) yPos[c] -= HEIGHT;
    while (xPos[c] < 0) xPos[c] += WIDTH;
    while (yPos[c] < 0) yPos[c] += HEIGHT;
    steps[c]--;
  }
}

#define DOT_SPEED 1
#define HUE_VAR 15
#define SAT_VAR 10
#define BRIGHT_VAR 80
void oneRandom(byte x, byte y) {
  setAt(x, y, CHSV(
    random(settings.hue - HUE_VAR, settings.hue + HUE_VAR),
    random(max(settings.saturation - SAT_VAR, 0), min(settings.saturation + SAT_VAR, 255)),
    random(255 - BRIGHT_VAR, 256)));  
}
void runRandom(bool initialize) {
  static long frameTarget;
  if (initialize) {
    frameTarget = 0;
    for (byte x = 0; x < WIDTH; x++) {
      for (byte y = 0; y < HEIGHT; y++) {
        if (!isImaginary(x, y)) {
          oneRandom(x, y);
        }
      }
    }
  }
  if (true) {
    byte x;
    byte y;
    do {
      x = random(WIDTH);
      y = random(HEIGHT);
    } while (isImaginary(x, y));
    if (millis() > frameTarget) {
      oneRandom(x, y);
      frameTarget = millis() + DOT_SPEED;
    }
  }
}



