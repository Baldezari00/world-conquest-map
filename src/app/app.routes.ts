import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { RegisterComponent } from './features/auth/register/register';
import { MapViewComponent } from './features/map/map-view/map-view';
import { InvasionsPanelComponent } from './features/invasions/invasions-panel/invasions-panel';
import { LeaderboardComponent } from './features/rankings/leaderboard/leaderboard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'map', component: MapViewComponent },
  { path: 'invasions', component: InvasionsPanelComponent },
  { path: 'rankings', component: LeaderboardComponent },  
  { path: '**', redirectTo: '/login' }
];