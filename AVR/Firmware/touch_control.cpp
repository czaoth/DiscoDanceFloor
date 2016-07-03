/*******************************************************************************
* Touch Controller
*
* Handles initializing the QTouch library and detecting touches.
******************************************************************************/

/*----------------------------------------------------------------------------
                                include files
----------------------------------------------------------------------------*/
#include <avr/io.h>
#include "touch_api.h"
#include "touch.h"
#include "touch_control.h"

/*----------------------------------------------------------------------------
                                extern variables
----------------------------------------------------------------------------*/

/* This configuration data structure parameters if needs to be changed will be
   changed in the qt_set_parameters function */
extern qt_touch_lib_config_data_t qt_config_data;

/* touch output - measurement data */
extern qt_touch_lib_measure_data_t qt_measure_data;

/*----------------------------------------------------------------------------
                                    macros
----------------------------------------------------------------------------*/
#define GET_SENSOR_STATE(SENSOR_NUMBER) qt_measure_data.qt_touch_status.sensor_states[(SENSOR_NUMBER/8)] & (1 << (SENSOR_NUMBER % 8))


/*============================================================================
 * Initialize the QTouch library
 *============================================================================*/
void touch_init( void ) {

  // Disable pull-ups
  MCUCR |= (1u << PUD);

  /* Configure the Sensors as keys or Keys With Rotor/Sliders in this function */
  config_sensors();

  /* initialise touch sensing */
  qt_init_sensing();

  /*  Set the parameters like recalibration threshold, Max_On_Duration etc in this function by the user */
  qt_set_parameters();

  /*  Address to pass address of user functions   */
  qt_filter_callback = 0;
}


/*============================================================================
 * Measure a touch sensor.
 *   + sensor_num: The sensor to measure (zero indexed)
 *   + current_time: The current time, in milliseconds
 *   + max_measurements: If multiple measurements are needed, this is the maximum measurements to make.
 *
 * Returns 1 = touch detected, 0 = no touch
 *============================================================================*/
uint8_t touch_measure(uint8_t sensor_num, uint16_t current_time) {

	/* status flags to indicate the re-burst for library */
  static uint16_t status_flag = 0u;
  static uint16_t burst_flag = 0u;

  do {
    status_flag = qt_measure_sensors( current_time );
    burst_flag = status_flag & QTLIB_BURST_AGAIN;
  } while (burst_flag);

  return GET_SENSOR_STATE(sensor_num);
}


/*============================================================================
 * Set the QTouch detection parameters and threshold values.
 *===========================================================================*/
static void qt_set_parameters() {
  qt_config_data.qt_di              = 12;
  qt_config_data.qt_neg_drift_rate  = 20;
  qt_config_data.qt_pos_drift_rate  = 5;
  qt_config_data.qt_max_on_duration = 255;
  qt_config_data.qt_drift_hold_time = 20;
  qt_config_data.qt_recal_threshold = RECAL_50;
  qt_config_data.qt_pos_recal_delay = 10;
}

/*============================================================================
 * Setup all the sensors
 *============================================================================*/
static void config_sensors() {
  qt_enable_key( CHANNEL_0, NO_AKS_GROUP, 10u, HYST_25 );
	// qt_enable_key( CHANNEL_0, NO_AKS_GROUP, 7u, HYST_25 );
  // qt_enable_key( CHANNEL_0, NO_AKS_GROUP, 7u, HYST_6_25 );
}


