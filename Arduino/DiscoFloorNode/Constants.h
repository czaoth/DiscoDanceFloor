
// Commands codes
#define TYPE_NULL         0x00
#define TYPE_ACK          0x01  // Acknowledge command
#define TYPE_NACK         0x02  // Unacknowledge command (the command that was sent was invalid)
#define TYPE_STRM_RESP    0x03  // Set streaming response mode
#define TYPE_BATCH        0x04  // Set batch update mode
#define TYPE_COLOR        0x05  // Set color
#define TYPE_FADE         0x06  // Set fade
#define TYPE_STATUS       0x07  // Set or Get node status
#define TYPE_RESET        0x10  // Reset node
#define TYPE_ADDR         0xF1  // Addressing


#define SERIAL_BAUD      500000

// Flags
#define FADING           0b00100000 // 0x20
#define SENSOR_DETECT    0b01000000 // 0x40

// PINS
#define TX_CONTROL       2    // RS485 TX Enable
#define RX_CONTROL       A5   // RS485 RX Enable
// #define SENSOR_SEND      3    // Connect a resistor from this pin to SENSOR_OUT
// #define SENSOR_TOUCH     8    // Connected to sensor area
// #define NEXT_NODE        5    // Enables the next node so it can register itself
// #define ENABLE_NODE      6    // Sets ID when HIGH
#define ENABLE_MASTER    7
#define NODE_STATUS      8

// RGB LED Pins
// #define LED_RED          11
// #define LED_GREEN        9
// #define LED_BLUE         10

// New PCB
#define LED_RED          5 // PD5 (OC0B)
#define LED_GREEN        6 // PD6 (OC0A)
#define LED_BLUE         3 // PD3 (OC2B)
#define SENSOR_SEND      10
#define SENSOR_TOUCH     8

// Daisy chain pins
#define DAISY_1          A3 // labeled "prev" on board
#define DAISY_2          A4 // labeled "next" on board

// RX/TX enable
#define RS485Transmit    HIGH
#define RS485Receive     LOW

// EEPROM Addresses
#define EEPROM_CELL_ADDR 0

// Everything else
#define SENSOR_THRESHOLD    30   // The value the capactive sensor must cross to register as ON
#define ACK_TIMEOUT         10   // How many milliseconds to wait for an ACK
#define FADE_DIVIDER        250  // What to divide the duration by before sending
#define IDLE_TIME         20000  // How long before going into idle mode

