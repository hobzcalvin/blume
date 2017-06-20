

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

CRGB col;
int eepromStart;

void setup() {
  Serial.begin(115200);

  pinMode(DATA_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  FastLED.addLeds<LED_SETTINGS>(leds, NUM_LEDS).setCorrection( TypicalLEDStrip );
  FastLED.setDither(BINARY_DITHER);
  FastLED.setBrightness(128);
  fill_solid(leds, NUM_LEDS, 0);
  FastLED.show();         
  //Serial.write("start");
  //col = 0xFFFF00;
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  EEPROM.put(eepromStart, int(0xFFFF));
  EEPROM.get(EEPROM_START_POINTER_ADDR, eepromStart);
  int thing;
  EEPROM.get(eepromStart, thing);
  Serial.print("estart");
  Serial.print(eepromStart);
  Serial.print(" thing ");
  Serial.println(thing);
}

uint8_t buf[6];

void loop() {
  
  if (Serial.available()) {
    byte c = Serial.read();
    //Serial.write(c);
    if (c == '1') {
      leds[0] = 0xFF00FF;
      Serial.write('k');
    } else if (c == '0') {
      leds[0] = 0;
      Serial.write('k');
    } else if (c == '!') {
      // Adafruit-style command.
      c = Serial.read();
      if (c == 'C' && readAndCheckCRC(255-'!'-'C', buf, 3)) {
        fill_solid(leds, NUM_LEDS, CHSV(buf[0], buf[1], 255));
        FastLED.setBrightness(buf[2]);
      } else if (c == 'X') {
        justRead(buf, 6);
        int16_t x = (((int16_t)(buf[1])) << 8) | ((int16_t)buf[0]);
        int16_t y = (((int16_t)(buf[3])) << 8) | ((int16_t)buf[2]);
        int16_t z = (((int16_t)(buf[5])) << 8) | ((int16_t)buf[4]);
        Serial.print(x);
        Serial.print(',');
        Serial.print(y);
        Serial.print(',');
        Serial.println(z);
        fill_rainbow(leds, NUM_LEDS, x, y);
      } else {
        Serial.write('X');
      }
      /*
      if (c == 'C' && Serial.available() >= 3) {
        // Color-picker.
        byte h = Serial.read();
        byte s = Serial.read();
        byte v = Serial.read();
        fill_solid(leds, NUM_LEDS, CHSV(h, s, 255));
        FastLED.setBrightness(v);
        byte buf[] = { '<', '>', h, s, v };
        Serial.write(buf, sizeof(buf));
      }
      */
    }
  }
  FastLED.show();
}

void justRead(uint8_t *buf, uint8_t n) {
  for (int c;;) {
    while ((c = Serial.read()) < 0);
    if (!n--) return;
    *buf++ = c;
  }
}

boolean readAndCheckCRC(uint8_t sum, uint8_t *buf, uint8_t n) {
  for(int c;;) {
    while((c = Serial.read()) < 0); // Wait for next byte
    if(!n--) return (c == sum);  // If CRC byte, we're done
    *buf++ = c;                  // Else store in buffer
    //sum   -= c;                  // and accumulate sum
  }
}
  
  /*byte buffer[3] = {
    0xAD, 
    (byte)(42),
    (byte)(69)
  };
  Serial.write(buffer, sizeof(buffer));*/

/*
  uint16_t sensorReading = 1;

  byte buffer[3] = {0xAD, 
                    (byte)sensorReading,
                    (byte)(sensorReading >> 8)
                   };

  Serial.write(buffer, sizeof(buffer));


  if (Serial.available())
  {

    byte cmd = Serial.read();

    if (cmd == 0x01) {

      //digitalWrite(LED, HIGH);
      leds[0] = 0xFF00FF;
    }
    else if (cmd == 0x00) {

      //digitalWrite(LED, LOW);
      leds[0] = 0x0000FF;
    }
  }

  FastLED.delay(1000);
  //delay(200);
  
}
*/
