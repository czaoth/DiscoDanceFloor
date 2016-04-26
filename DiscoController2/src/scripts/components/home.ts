import {Component} from 'angular2/core';
import {
  RouteConfig,
  ROUTER_DIRECTIVES} from 'angular2/router';

import {DiscoFloorComponent} from './floor.ts';
import {SettingsComponent} from './settings.ts';
import {ConnectComponent} from './connect.ts';

//
// Root Component
//
@Component({
  selector: 'app-root',
  templateUrl: './html/layout.html',
  directives: [ROUTER_DIRECTIVES]
})
@RouteConfig([
  { path: '/floor', name: 'Floor', component: DiscoFloorComponent, useAsDefault: true },
  { path: '/connect', name: 'Connect', component: ConnectComponent },
  { path: '/settings', name: 'Settings', component: SettingsComponent }
])
export class AppHomeComponent {

}