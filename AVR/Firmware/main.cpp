/*******************************************************************************
* A single disco sqare node.
* 
* This program connects to a multi-drop network as a slave node and 
* waits for the master node to ask it to check the touch sensor and to set the color
* of the RGB LED.
******************************************************************************/

#include <avr/io.h>

#include "pwm.h"
#include "clock.h"
#include "touch.h"
#include "touch_control.h"
#include "MultidropSlave.h"
#include "MultidropData485.h"

/*----------------------------------------------------------------------------
                                prototypes
----------------------------------------------------------------------------*/

void init_comm();
void handle_message();
void set_color(uint8_t *rgb);
void read_sensor();

/*----------------------------------------------------------------------------
                                message commands
----------------------------------------------------------------------------*/

#define CMD_SET_COLOR         0xA1
#define CMD_RUN_SENSOR        0xA2
#define CMD_SEND_SENSOR_VALUE 0xA3

/*----------------------------------------------------------------------------
                                global variables
----------------------------------------------------------------------------*/

// The last touch sensor value
uint8_t sensor_value = 0;

// Bus serial
MultidropData485 serial(PD2, &DDRD, &PORTD);
MultidropSlave comm(&serial);

/*----------------------------------------------------------------------------
                                main program
----------------------------------------------------------------------------*/

int main() {
  DDRB |= (1 << PB2); // debug LED

  start_clock();
  init_comm();
  init_pwm();

  while(1) {
    comm.read();
    if (comm.hasNewMessage() && comm.isAddressedToMe()) {
      handle_message();
    }
  }
}

/**
 * Initialize the serial communication bus.
 */
void init_comm() {
  // enable pull-up on RX pin
  PORTD |= (1 << PD0);

  serial.begin(9600);
  
  // Define daisy chain lines and let polarity (next/previous) be determined at runtime
  comm.addDaisyChain(PC3, &DDRC, &PORTC, &PINC,
                     PC4, &DDRC, &PORTC, &PINC);
}

/**
 * Handle a new message received from the bus.
 */
void handle_message() {
  switch (comm.getCommand()) {
    case CMD_SET_COLOR:
      if (comm.getDataLen() == 3) {
        set_color(comm.getData());
      }
    break;
  }
}

/**
 * Update RGB LED values
 */
void set_color(uint8_t *rgb) {
  red_pwm(rgb[0]);
  green_pwm(rgb[1]);
  blue_pwm(rgb[2]);
}

/**
 * Get a new reading from the touch sensor.
 */
void read_sensor() {

}
