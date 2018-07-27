// These settings change per project!
#define NUM_LEDS    256
// If true, LEDs are arranged in columns instead of rows.
// BASE_WID is the vertical dimension in this case.
#define ROTATE false
// Width of the piece, unless ROTATE is true.
#define BASE_WID  16
// If true, adds 1 to BASE_WID for every other row (column if ROTATE)
#define STAGGERED false
// Wiring is in a zig-zag pattern.
#define ZIGZAG   false
// 0,0 should be the top-left pixel in a 2D arrangment.
// If not, use these to move it to another corner of the display.
#define FLIP_HORIZONTAL false
// DotStar FeatherWing flips vertical.
#define FLIP_VERTICAL false
// Support text mode; currently 6-pixel height only.
#define TEXTMODE false
// Set max milliamp draw limit, assuming standard 5-volt LEDs.
#define MAX_MILLIAMPS 3000
// Rotary encoder with button control.
/*#define ENCODER true
#define ENC_P1 22
#define ENC_P2 23
#define ENC_SW 21*/

// Turn on R-G-B startup sequence, debug messages to serial console, etc.
#define DEBUG true 

// These are used by ESP32_OTA and ESP32_OPC support.
#define WIFI_SSID "Your Wifi Network"
#define WIFI_PASSWORD "yourpassword"

// Only change these settings if you're wired to different pins, using a non-APA102 chipset,
// using a different COLOR_ORDER for RGB, etc.
#ifdef ESP32
// Open Pixel Control support can be turned on or off.
#define ESP32_OPC
// Over-the-air updates can be turned on or off.
//#define ESP32_OTA
// No standard pins for ESP32 yet; I'm using these at the moment.
#define DATA_PIN_0    12
#define CLOCK_PIN_0   13
// A second set of pins get the same signal.
// Useful when connecting multiple strips.
// Here, use PIXO Pixel's defaults.
#define DATA_PIN_1    19
#define CLOCK_PIN_1   18
// Give your project a name!
#define BLUETOOTH_NAME "Blume"
// This varies by ESP32 dev board.
#define LED_PIN LED_BUILTIN
#else
#define DATA_PIN_0    A0
#define CLOCK_PIN_0   5
#define DATA_PIN_1    A1
#define CLOCK_PIN_1   4
#endif
#define COLOR_ORDER BGR
#define CHIPSET     APA102
#define APA_MHZ 2
/* For LPD8806:
#define COLOR_ORDER BRG
#define CHIPSET     LPD8806
 */








// EVERYTHING BELOW HERE WON'T CHANGE FOR A NORMAL PROJECT.







#ifdef ESP32
// All of these are needed for Bluetooth functionality.
#include <BLEDevice.h>
#include <BLEDeviceID.h>
#include <BLESerial.h>
#include <BLEServer.h>
// FastLED seems to need this.
#define FASTLED_FORCE_SOFTWARE_PINS
// Something small and reasonable.
#define EEPROM_SIZE 64
#endif // ESP32

#ifdef ESP32_OTA
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#endif // ESP32_OTA

#ifdef ESP32_OPC

#if DEBUG
#define OPC_SERV_INFO 1
#define OPC_SERV_PERF 1
#define OPC_SERV_DEBUG 1
#endif // DEBUG

#include <WiFi.h>
#include "Opc.h"
#include "OpcServer.h"

#define OPC_PORT 7890
#define OPC_CHANNEL 1
#define OPC_MAX_CLIENTS 1
#define OPC_MAX_PIXELS NUM_LEDS
#define OPC_BUFFER_SIZE (OPC_MAX_PIXELS * 3 + OPC_HEADER_BYTES)
#define OPC_DISPLAY_TIMEOUT 5000

WiFiServer opcWifiServer = WiFiServer(OPC_PORT);
OpcClient opcClients[OPC_MAX_CLIENTS];
uint8_t buffer[OPC_BUFFER_SIZE * OPC_MAX_CLIENTS];
OpcServer opcServer = OpcServer(
    opcWifiServer, OPC_CHANNEL,opcClients, OPC_MAX_CLIENTS, buffer,
    OPC_BUFFER_SIZE);
long lastOpc = 0;
uint16_t opcCount = 0;

#endif // ESP32_OPC



#if TEXTMODE
// Include this here because it uses keywords we #define below like "WIDTH" and "HEIGHT"
#include "Adafruit_GFX.h"
#endif // TEXTMODE


#include <EEPROM.h>
// Must come after FASTLED_FORCE_SOFTWARE_PINS above
#include <FastLED.h>


#define EEPROM_SAVE_TIMEOUT_MS 5000
#define EEPROM_START_POINTER_ADDR 0x0

#if (CHIPSET == APA102)
#define LED_SETTINGS_0 CHIPSET, DATA_PIN_0, CLOCK_PIN_0, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)
#define LED_SETTINGS_1 CHIPSET, DATA_PIN_1, CLOCK_PIN_1, COLOR_ORDER, DATA_RATE_MHZ(APA_MHZ)
#else
#define LED_SETTINGS_0 CHIPSET, CLOCK_PIN_0, DATA_PIN_0, COLOR_ORDER
#define LED_SETTINGS_1 CHIPSET, CLOCK_PIN_1, DATA_PIN_1, COLOR_ORDER
#endif

CRGB leds[NUM_LEDS];

// Calculate max number of frames we can store in SRAM
#ifdef ESP32
// ESP32 can run insanely fast; make this non-insane.
#define MAX_FPS 120
// TODO: For now, only non-STAGGERED arragements are supported.
// ESP32 SRAM is huge; carve out 4kB
#define MAX_FRAMES (STAGGERED ? 0 : (4096 / NUM_LEDS))
#else
#define SRAM_SIZE 2048
// Assume we need this much for everything else
#define VAR_ALLOWANCE (NUM_LEDS * 3 + 850)
#define MAX_FRAMES (BASE_WID == 1 ? (SRAM_SIZE - VAR_ALLOWANCE) / NUM_LEDS : 0)
#endif // ESP32

#define logical_num_leds (STAGGERED ? NUM_LEDS * 2 : NUM_LEDS)
// These are the width/height assuming rows of LEDs.
#define PHYSICAL_WIDTH (STAGGERED ? BASE_WID * 2 + 1 : BASE_WID)
// Add extra row if there's a remainder.
#define PHYSICAL_HEIGHT (logical_num_leds / PHYSICAL_WIDTH + (logical_num_leds % PHYSICAL_WIDTH ? 1 : 0))
// If ROTATE is true, LEDs are in columns, not rows, so flip the 
// physical dimensions when generating the dimensions the rest of the code uses.
#if ROTATE
#define WIDTH PHYSICAL_HEIGHT
#define HEIGHT PHYSICAL_WIDTH
#else
#define WIDTH PHYSICAL_WIDTH
#define HEIGHT PHYSICAL_HEIGHT
#endif

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

#if ENCODER
#include <Encoder.h>
Encoder encoder(ENC_P1, ENC_P2);
// Is the encoder's swith currently pressed?
volatile bool encoderPressed = false;
// true when the main run loop should restoreSettings().
// We can't call it directly; it crashes, probably due to
// concurrency issues.
volatile bool encoderNewSettingsPending = false;
// Used when switch was pressed to turn on.
volatile bool encoderClickDisabled = false;
// Has the encoder knob moved during the current press?
volatile bool encoderMovedDuringPress = false;
// millis() when the encoder switch was pressed
volatile long encoderPressTime = 0;
// settings.brightness when the encoder switch was pressed
volatile byte encoderPressInitialBrightness = 255;
// Un-pressed encoder position
volatile int32_t encoderPrimary = 0;
// Pressed encoder position
volatile int32_t encoderSecondary = 0;
// Last raw encoder value, regardless of press state
volatile int32_t lastEncoder = 0;
portMUX_TYPE encoderMux = portMUX_INITIALIZER_UNLOCKED;
#define ENCODER_DEBOUNCE_MS 100
// How many milliseconds before a pending click becomes a
// long-held press to change brightness
#define ENCODER_LONG_PRESS 1000
// After ENCODER_LONG_PRESS milliseconds, this additional time
// reduces brightess by one level.
#define ENCODER_MS_PER_BRIGHTNESS 10
SavedSettings encoderModes[] = {
  // Standard color mode with a warm yellow
  { 255, 'C', 60, 255, 0, 0 },
  // Small slow blobs
  { 255, 'B', 14, 45, 45, 45 },
  // Fire
  { 255, 'Z', 16, 255, 139, 118 },
  // Blue blobs
  { 255, 'B', 38, 147, 43, 255 },
  // Pulsing red
  { 255, 'M', 0, 255, 47, 149 },
  // Twinkle
  { 255, 'Z', 0, 0, 124, 154 },
  // Chasing blue
  { 255, 'M', 168, 255, 51, 98 },
  // Noise
  { 255, 'Z', 0, 255, 201, 201 },
  // Chasing rainbow
  { 255, 'M', 168, 255, 149, 100 }
};
byte nextEncoderMode = 0;
#endif // ENCODER


#if TEXTMODE
#if (HEIGHT >= 8)
#define FONT NULL
#define TEXT_OFFSET (HEIGHT - (HEIGHT/8) * 8) / 2
#elif (HEIGHT >= 6)
#include "Picopixel.h"
#define FONT &Picopixel
#define TEXT_OFFSET (HEIGHT - 6) + 4
#endif

void setAt(uint16_t x, uint16_t y, CRGB color);
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
  setAt(x, y, realColor);
  printed = true;
}

BlumeGFX gfx = BlumeGFX(WIDTH, HEIGHT);

// Max length 64
char text[64] = "pqgjy Hello World! I'm Blume. :-)";
void runText(bool initialize) {
  // TODO: c1 = speed, or rainbow on?
  // TODO: c2 = rainbow size, or rainbow vertical?
  static int pos = WIDTH;
  static long nextShift;
  if (initialize) {
    gfx.setTextSize(HEIGHT / 8);
    gfx.setFont(FONT);
    gfx.setTextWrap(false);
    nextShift = 0;
  }
  if (!nextShift || millis() >= nextShift) {
    pos--;
    nextShift = millis() + 90;
  }
  gfx.setCursor(pos, TEXT_OFFSET);
  fill_solid(leds, NUM_LEDS, 0);
  gfx.realColor = CHSV(settings.hue, settings.saturation, 255);
  gfx.printed = false;
  gfx.print(text);
  if (!gfx.printed && pos < WIDTH / 2) {
    pos = WIDTH;
  }
}
#endif // TEXTMODE

#ifdef ESP32
// These aren't defined out of the box??
#define min(x,y) ((x) <= (y) ? (x) : (y))
#define max(x,y) ((x) >= (y) ? (x) : (y))
BLESerial bleSerial = BLESerial();
#define STREAM bleSerial
#else
#define STREAM Serial
#endif // ESP32


void setup() {
  Serial.begin(115200);
  // Only wait 500ms for new data before giving up on a command
  Serial.setTimeout(500);

  // Initialize and turn off LEDs before any slower startup stuff.  
  pinMode(DATA_PIN_0, OUTPUT);
  pinMode(CLOCK_PIN_0, OUTPUT);
  pinMode(DATA_PIN_1, OUTPUT);
  pinMode(CLOCK_PIN_1, OUTPUT);
  FastLED.addLeds<LED_SETTINGS_0>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.addLeds<LED_SETTINGS_1>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(DISABLE_DITHER);
#if defined(MAX_MILLIAMPS) && MAX_MILLIAMPS
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MILLIAMPS);
#endif
  // Turn everything off at first to avoid buggy lingering data on the chips
  FastLED.setBrightness(0);
  FastLED.show();

#ifdef ESP32
  BLEDevice::init(BLUETOOTH_NAME);
  BLEServer* server = BLEDevice::createServer();
  bleSerial.begin(server, BLEUUID((uint16_t)0xDFB0), BLEUUID((uint16_t)0xDFB1));
  BLEDeviceID* did = new BLEDeviceID(
    server,
    "0x0BB9FD999969D238",
    "DF Bluno",
    "0123456789",
    "FW V1.97",
    "HW V1.7",
    "SW V1.97",
    "DFRobot",
    "",
    1,
    0x0010,
    0x0D00,
    0);
  did->start();
  server->getAdvertising()->start();
  STREAM.setTimeout(500);
#endif // ESP32
  
#if defined(ESP32_OTA) || defined(ESP32_OPC)
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif // ESP32_OTA || ESP32_OPC

#ifdef ESP32_OTA
  // Port defaults to 3232
  // ArduinoOTA.setPort(3232);

  // Hostname defaults to esp3232-[MAC]
  // ArduinoOTA.setHostname("myesp32");

  // No authentication by default
  // ArduinoOTA.setPassword("admin");

  // Password can be set with it's md5 value as well
  // MD5(admin) = 21232f297a57a5a743894a0e4a801fc3
  // ArduinoOTA.setPasswordHash("21232f297a57a5a743894a0e4a801fc3");

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH)
      type = "sketch";
    else // U_SPIFFS
      type = "filesystem";

    // NOTE: if updating SPIFFS this would be the place to unmount SPIFFS using SPIFFS.end()
    Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });
  ArduinoOTA.begin();
#endif // ESP32_OTA

#ifdef ESP32_OPC
  opcServer.setMsgReceivedCallback(cbOpcMessage);
  opcServer.setClientConnectedCallback(cbOpcClientConnected);
  opcServer.setClientDisconnectedCallback(cbOpcClientDisconnected);
  opcServer.begin();
  opcServer.mDNSBegin("blume");
#endif

#if ENCODER
  pinMode(ENC_SW, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_SW), encoderSwitchHandler, CHANGE);
  // Make sure we're in sync with current switch state.
  encoderSwitchHandler();
#endif // ENCODER

#if DEBUG
#ifdef LED_PIN
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
#endif
  FastLED.setBrightness(7);
  fill_solid(leds, NUM_LEDS, 0xFF0000);
  FastLED.delay(500);
  Serial.print(F("\aWidth: "));
  Serial.println(WIDTH);
  fill_solid(leds, NUM_LEDS, 0x00FF00);
#ifdef LED_PIN
  digitalWrite(LED_PIN, LOW);
#endif
  FastLED.delay(500);
  Serial.print(F("\aHeight: "));
  Serial.println(HEIGHT);
  fill_solid(leds, NUM_LEDS, 0x0000FF);
#ifdef LED_PIN
  digitalWrite(LED_PIN, HIGH);
#endif
  FastLED.delay(500);
  Serial.print(F("\aNumber of LEDs: "));
  Serial.println(NUM_LEDS);
  fill_solid(leds, NUM_LEDS, 0x000000);
#ifdef LED_PIN
  digitalWrite(LED_PIN, LOW);
#endif
  FastLED.delay(500);
#endif

#ifdef ESP32
  EEPROM.begin(EEPROM_SIZE);
#endif
  // Should be first time only: Write a valid eepromStart address
  EEPROM.put(EEPROM_START_POINTER_ADDR, (int)0x4);
#ifdef ESP32
  EEPROM.commit();
#endif
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
  static int totalLoops = 0;
  static long totalDurations = 0;
  totalDurations += lastFrameDuration;
  totalLoops++;
  if (totalLoops == 700) {
    Serial.print(millis());
    Serial.print(F(" FPS: "));
    Serial.print((float)totalLoops / (float)totalDurations * 1000.0);
#ifdef ESP32_OPC
    Serial.print(" OPCPS: ");
    Serial.print((float)opcCount / (float)totalDurations * 1000.0);
    opcCount = 0;
    Serial.print(" IP address: ");
    Serial.print(WiFi.localIP());
#endif
    Serial.println();
    totalLoops = 0;
    totalDurations = 0;
  }
#endif
}



void loop() {
  lastFrameDuration = millis() - lastFrameTime;
  lastFrameTime += lastFrameDuration;
#if ENCODER
  if (encoderNewSettingsPending) {
    encoderNewSettingsPending = false;
    restoreFromSettings(false);
  }
#endif
#ifdef ESP32_OPC
  if (!lastOpc || lastOpc < millis() - OPC_DISPLAY_TIMEOUT) {
#else
  if (true) {
#endif
    runMode();
  }
  checkSerial();
  checkSave();
  doFPS();
#ifdef ESP32_OTA
  ArduinoOTA.handle();
#endif
#ifdef ESP32_OPC
  opcServer.process();
#endif
#if ENCODER
  portENTER_CRITICAL(&encoderMux);
  checkEncoder();
  portEXIT_CRITICAL(&encoderMux);
#endif // ENCODER
#ifdef MAX_FPS
  do {
    // show() at least once,
    FastLED.show();
    // and until it's been at least the minimum frame duration.
  } while (millis() < lastFrameTime + 1000 / MAX_FPS);
#else
  FastLED.show();
#endif // MAX_FPS
}

inline bool isImaginary(uint16_t x, uint16_t y) {
  return x >= WIDTH || y >= HEIGHT || (
    STAGGERED && (x % 2 != y % 2));
}
void setAt(uint16_t x, uint16_t y, CRGB color) {
  uint16_t idx;
  if (FLIP_HORIZONTAL) {
    x = WIDTH - 1 - x;
  }
  if (FLIP_VERTICAL) {
    y = HEIGHT - 1 -y;
  }
  if (ROTATE) {
    idx = x;
    x = y;
    y = idx;
  }
  if (STAGGERED) {
    if (isImaginary(x, y)) {
      return;
    }
    idx = x / 2 + (x % 2) * (BASE_WID + 1) + PHYSICAL_WIDTH * (y / 2);
  } else {
    idx = ((ZIGZAG && y % 2) ? (PHYSICAL_WIDTH - 1 - x) : x) + y * PHYSICAL_WIDTH;
  }
  // Safety
  if (idx < NUM_LEDS) {
    leds[idx] = color;
  }
}
void fillRow(uint16_t row, CRGB color) {
  for (uint16_t i = 0; i < WIDTH; i++) {
    setAt(i, row, color);
  }
}
void fillCol(uint16_t col, CRGB color) {
  for (uint16_t i = 0; i < HEIGHT; i++) {
    setAt(col, i, color);
  }
}

void sendSeparately(byte* buf, int len) {
  // Flush any existing sending,
  STREAM.flush();
  // wait a while for that to go through,
  delay(100);
  // and send what should be a new blob.
  STREAM.write(buf, len);
}

void flushSerialIn() {
  while (STREAM.available() > 0) {
    STREAM.read();
  }
}

void checkSerial() {
  // No serial to consume; stop.
  if (!STREAM.available()) {
    return;
  }
  if (!STREAM.find("!")) {
#if DEBUG    
    Serial.println(F("no !"));
#endif
    flushSerialIn();
    return;
  }
  //Serial.println("found !");
  byte len;
  if (!STREAM.readBytes(&len, 1)) {
#if DEBUG
    Serial.println(F("no len"));
#endif
    flushSerialIn();
  }
  if (!len) {
    // Special case: no length means primary is asking a question.
    byte question;
    if (!STREAM.readBytes(&question, 1)) {
#if DEBUG
      Serial.println(F("no question"));
#endif
      flushSerialIn();
    } else {
      if (question == 'D') {
        // Send dimensions.
        byte dims[] = { '!', 'D', WIDTH, HEIGHT, NUM_LEDS, MAX_FRAMES,
#if TEXTMODE
          sizeof(text)
#else
          0
#endif
        };
        sendSeparately(dims, sizeof(dims));
      }
    }
    return;
  }

  SavedSettings previous = settings;
  if (!STREAM.readBytes((byte*)&settings, min(sizeof(settings), len))) {
#if DEBUG
    Serial.println(F("failed to read len bytes"));
#endif
    flushSerialIn();
    settings = previous;
    return;
  }
  if (settings.mode == 'P') {
    // hue means number of frames in this case
    if (settings.hue) {
      // We're getting frames in this message. How many bytes?
      uint16_t bytesToRead;
      // c1 is bit depth. Currently supported: 8, 24.
      if (settings.c1 == 8) {
        // 8-bit means 1 byte per pixel * "hue" frames.
        bytesToRead = settings.hue;
      } else if (settings.c1 == 24) {
        // 24-bit means 3 bytes per pixel * "hue" frames.
        bytesToRead = settings.hue * 3;
      } else {
#if DEBUG
        Serial.print(F("Unsupported bit depth: "));
        Serial.println(settings.c1);
#endif
        bytesToRead = 0;
        flushSerialIn();
        settings = previous;
      }
      // Make sure we aren't going beyond MAX_FRAMES
      bytesToRead = min(bytesToRead, MAX_FRAMES);
      // Multiply by number of pixels
      bytesToRead *= NUM_LEDS;
      if (bytesToRead > 0 &&
          !STREAM.readBytes(ledFrames, bytesToRead)) {
#if DEBUG
        Serial.print(F("failed to read "));
        Serial.print(settings.hue);
        Serial.print(F(" image frames at bit depth "));
        Serial.print(settings.c1);
        Serial.print(F(" total expected bytes "));
        Serial.println(bytesToRead);
#endif
        flushSerialIn();
        settings = previous;
      }
    } else if (previous.mode == 'P') {
      // Special case: frame count of 0 means no frames sent.
      // The mode must have already been 'P' for this to work.
      settings.hue = previous.hue;
    } else {
#if DEBUG
      Serial.println(F("Can't modify frame timing without image frames first"));
#endif
      flushSerialIn();
      settings = previous;
    }
#if TEXTMODE
  } else if (settings.mode == 'T') {
    // Read up to the full length of text, or until a null terminator.
    // Less error handling here; we don't really care what we get.
    byte bytesRead = STREAM.readBytesUntil('\0', text, sizeof(text));
    if (bytesRead) {
      if (bytesRead < sizeof(text)) {
        for (byte i = bytesRead; i < sizeof(text); i++) {
          text[i] = ' ';
        }
      }
    }
#endif
  }
  // We have new settings! Apply them.
  restoreFromSettings(false);
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
#ifdef ESP32
    EEPROM.commit();
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
#endif // TEXTMODE
  }
#if DEBUG
  Serial.print(F("settings: "));
  Serial.print(settings.brightness);
  Serial.print(',');
  Serial.print(char(settings.mode));
  Serial.print(',');
  Serial.print(settings.hue);
  Serial.print(',');
  Serial.print(settings.saturation);
  Serial.print(',');
  Serial.print(settings.c1);
  Serial.print(',');
  Serial.println(settings.c2);
#endif
#if ENCODER
  // New mode: reset encoder values.
  encoderPrimary = 0;
  encoderSecondary = 0;
#endif // ENCODER
  
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
  } else if (settings.mode == 'Z') {
    runRandom(true);
  } else if (settings.mode == 'P') {
    runPixels(true);
  } else if (settings.mode == 'B') {
    runBlobs(true);
#if TEXTMODE
  } else if (settings.mode == 'T') {
    runText(true);
#endif
  } else {
#if DEBUG
    Serial.print(F("Unknown mode: "));
    Serial.println(settings.mode);
#endif
  }
  if (!loadEeprom) {
    // Plan to save this if we don't get any more data
    saveTarget = millis() + EEPROM_SAVE_TIMEOUT_MS;
  }
}

void runMode() {
  FastLED.setBrightness(settings.brightness);
  if (settings.mode == 'M') {
    runMovement(false);
  } else if (settings.mode == 'Z') {
    runRandom(false);
  } else if (settings.mode == 'P') {
    runPixels(false);
  } else if (settings.mode == 'B') {
    runBlobs(false);
#if TEXTMODE
  } else if (settings.mode == 'T') {
    runText(false);
#endif
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
  for (uint16_t i = 0; i < dimension; i++) {
    float distance = min(
      abs(float(i) - position),
      (i < dimension / 2) ?
        abs(float(i) - position + dimension) :
        abs(float(i) - position - dimension));
    CRGB color;
    if (rainbow) {
      color = CHSV(int(float(settings.hue) + distance * size) % 256,
                   settings.saturation, 255);
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
    for (uint16_t x = 0; x < WIDTH; x++) {
      for (uint16_t y = 0; y < HEIGHT; y++) {
        CRGB color;
        if (settings.c1 == 8) {
          byte c = ledFrames[frame * NUM_LEDS + x + y * WIDTH];
          color = CRGB(
            ((c & 0b11100000) >> 5) * 36,
            ((c & 0b00011100) >> 2) * 36,
            ((c & 0b00000011) >> 0) * 85
          );
        } else if (settings.c1 == 24) {
          color = *((CRGB*)(ledFrames + (frame * NUM_LEDS + x + y * WIDTH) * 3));
        }
        setAt(x, y, color);
      }
    }
    frame = (frame + 1) % settings.hue;
    // Non-POV displays don't need short between-frame times; this gives
    // us a lower limit of 100FPS for animations.
    target_us = micros() + long(settings.saturation) * (WIDTH == 1 ? 100 : 10000);
  }
}

// Positions should really be uint16_ts,
// but we're about to do arithmetic with them that wants negative results.
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
  for (uint16_t x = 0; x < WIDTH; x++) {
    for (uint16_t y = 0; y < HEIGHT; y++) {
      if (isImaginary(x, y)) {
        continue;
      }
      for (byte c = RED; c <= BLUE; c++) {
        if (size[c] == 0) {
          color[c] = 0;
          continue;
        }
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
      xIncrement[c] = (float)(random(allowZero ? 0 : WIDTH * settings.hue / 2,
                                     WIDTH * settings.hue) + 100) / 50000.0;
      yIncrement[c] = (float)(random(allowZero ? 0 : HEIGHT * settings.hue / 2,
                                     HEIGHT * settings.hue) + 100) / 50000.0;
      if (random(2)) {
        xIncrement[c] *= -1;
      }
      if (random(2)) {
        yIncrement[c] *= -1;
      }
      // Steps should also scale with framerate; use lastFrameDuration as a guess
      steps[c] = random(lastFrameDuration * 5, lastFrameDuration * 25);
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

void oneRandom(uint16_t i) {
  bool rainbow = settings.c1 > 100;
  byte _size = mapRange(settings.c2 > 100 ? settings.c2 - 101 :
                        settings.c2, 0, 100, 0, 255);
  leds[i] = CHSV(
    rainbow ?
      settings.hue + random8(_size) :
      settings.hue,
    rainbow ? settings.saturation : max(settings.saturation, random8()),
    rainbow ? 255 - random8(255 - settings.saturation) : 255 - random8(255 - _size));  
}
void runRandom(bool initialize) {
  if (initialize) {
    for (uint16_t i = 0; i < NUM_LEDS; i++) {
      oneRandom(i);
    }
  }
  uint16_t numRand = mapRange(settings.c1 > 100 ? settings.c1 - 101 : settings.c1,
                          0, 100, 1, NUM_LEDS);
  for (uint16_t i = 0; i < numRand; i++) {
    oneRandom(random16(NUM_LEDS));
  }
}

#ifdef ESP32_OPC
void cbOpcMessage(uint8_t channel, uint8_t command, uint16_t length, uint8_t* data) {
  memcpy(leds, data, min(length, sizeof(leds)));
  lastOpc = millis();
  opcCount++;
  // Maximize brightness; pixel data knows no brightness level
  FastLED.setBrightness(255);
}

// Callback when a client is connected
void cbOpcClientConnected(WiFiClient& client) {
  Serial.print("New OPC Client: ");
  Serial.println(client.remoteIP());
}

// Callback when a client is disconnected
void cbOpcClientDisconnected(OpcClient& opcClient) {
  Serial.print("Client Disconnected: ");
  Serial.println(opcClient.ipAddress);
}
#endif

#if ENCODER
void checkEncoder() {
  // Get "raw" encoder value
  int32_t val = encoder.read();
  // First, check if we're in a long press, which overrides any
  // encoder movement.
  if (encoderPressed &&
      !encoderMovedDuringPress &&
      millis() > encoderPressTime + ENCODER_LONG_PRESS) {
    // We're in the middle of a long press; reduce brightness accordingly.
    settings.brightness = max(
      0,
      (int)encoderPressInitialBrightness -
        (int)(millis() - encoderPressTime - ENCODER_LONG_PRESS) /
        ENCODER_MS_PER_BRIGHTNESS);
#if DEBUG
  Serial.print("NewBright! ");
  Serial.print(encoderPressInitialBrightness);
  Serial.print(" => ");
  Serial.print(settings.brightness);
  Serial.print("   ");
  Serial.print(millis());
  Serial.print(',');
  Serial.println(encoderPressTime);
#endif
  // We're not in a long press; did the encoder move?
  } else if (val != lastEncoder) {
    // If brightness is zero, probably due to a long press,
    // turn back on given this new interaction.
    if (settings.brightness == 0) {
      settings.brightness = 255;
    }
    if (encoderPressed) {
      encoderMovedDuringPress = true;
      encoderSecondary += val - lastEncoder;
      settings.saturation += val - lastEncoder;
    } else {
      encoderPrimary += val - lastEncoder;
      settings.hue += val - lastEncoder;
    }
    encoderNewSettingsPending = true;
    lastEncoder = val;
#if DEBUG
    Serial.print("Encoder change: ");
    Serial.print(encoderPrimary);
    Serial.print(',');
    Serial.print(encoderSecondary);
    Serial.print(',');
    Serial.println(encoderPressed);
#endif
  }
}
void encoderSwitchHandler() {
  portENTER_CRITICAL_ISR(&encoderMux);
#if DEBUG
  Serial.print("Switch! ");
  Serial.println(!digitalRead(ENC_SW));
#endif
  if (!digitalRead(ENC_SW) != encoderPressed) {
    encoderPressed = !encoderPressed;
    long ms = millis();
    if (encoderPressed) {
      // If brightness is zero, probably due to a long press,
      // turn back on given this new interaction.
      if (settings.brightness == 0) {
        settings.brightness = 255;
        // Also, make sure this interaction will never register
        // as a click, though it could register as other stuff.
        encoderClickDisabled = true;
      } else {
        encoderClickDisabled = false;
      }
      encoderMovedDuringPress = false;
      encoderPressTime = ms;
      encoderPressInitialBrightness = settings.brightness;
    } else if (!encoderMovedDuringPress &&
               !encoderClickDisabled &&
               ms > encoderPressTime + ENCODER_DEBOUNCE_MS &&
               ms <= encoderPressTime + ENCODER_LONG_PRESS) {
#if DEBUG
      Serial.print("Click! New mode: ");
      Serial.println(nextEncoderMode);
#endif
      settings = encoderModes[nextEncoderMode];
      nextEncoderMode = (nextEncoderMode + 1) %
        (sizeof(encoderModes) / sizeof(SavedSettings));
      encoderNewSettingsPending = true;
    }
  }
  checkEncoder();
  portEXIT_CRITICAL_ISR(&encoderMux);
}
#endif // ENCODER
