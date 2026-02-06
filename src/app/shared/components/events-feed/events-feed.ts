import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventsService, GlobalEvent } from '../../../core/services/events';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-events-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './events-feed.html',
  styleUrls: ['./events-feed.scss']
})
export class EventsFeedComponent implements OnInit, OnDestroy {
  @Input() seasonId: string = '';
  @Input() limit: number = 20;
  
  events: GlobalEvent[] = [];
  loading = true;
  realtimeChannel?: RealtimeChannel;

  constructor(public eventsService: EventsService) {}

  ngOnInit() {
    if (this.seasonId) {
      this.loadEvents();
      this.subscribeToNewEvents();
    }
  }

  ngOnDestroy() {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
    }
  }

  loadEvents() {
    this.eventsService.getGlobalEvents(this.seasonId, this.limit).subscribe({
      next: (events) => {
        this.events = events;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando eventos:', error);
        this.loading = false;
      }
    });
  }

  subscribeToNewEvents() {
    this.realtimeChannel = this.eventsService.subscribeToEvents(
      this.seasonId,
      (newEvent) => {
        // Agregar nuevo evento al inicio
        this.events.unshift(newEvent);
        
        // Limitar a cantidad máxima
        if (this.events.length > this.limit) {
          this.events.pop();
        }
      }
    );
  }

  getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Hace unos segundos';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  }

  getEventMessage(event: GlobalEvent): string {
    const username = event.user?.username || 'Alguien';
    const cityName = event.city?.name || 'una ciudad';
    const countryName = event.country?.name || event.city?.country?.name || 'un país';

    switch (event.event_type) {
      case 'city_purchased':
        return `${username} compró ${cityName}`;
      case 'city_conquered':
        return `${username} conquistó ${cityName}`;
      case 'country_conquered':
        return `${username} conquistó todo ${countryName}`;
      case 'invasion_started':
        return `${username} inició invasión sobre ${cityName}`;
      default:
        return event.message;
    }
  }
}