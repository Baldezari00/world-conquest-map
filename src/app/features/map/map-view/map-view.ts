import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CityService, City } from '../../../core/services/city.service';
import { SeasonService, Season } from '../../../core/services/season.service';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-view.html',
  styleUrls: ['./map-view.scss']
})
export class MapViewComponent implements OnInit, OnDestroy, AfterViewInit {
  username: string = '';
  userId: string = '';
  map: any;
  cities: City[] = [];
  activeSeason: Season | null = null;
  userCities: City[] = [];
  
  totalCities: number = 0;
  totalInhabitants: number = 0;

  constructor(
    private supabase: SupabaseService,
    private cityService: CityService,
    private seasonService: SeasonService,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.supabase.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = user.id;
    await this.loadUserProfile();
    await this.loadActiveSeason();
    this.setupGlobalFunctions();
  }

  ngAfterViewInit() {
    // Esperar a que el DOM esté completamente renderizado
    setTimeout(() => {
      this.initMap();
      this.loadCities();
    }, 100);
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  async loadUserProfile() {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .single();

    if (data) {
      this.username = data.username || 'Conquistador';
      this.totalCities = data.total_cities || 0;
      this.totalInhabitants = data.total_inhabitants || 0;
    }
  }

  async loadActiveSeason() {
    this.seasonService.getActiveSeason().subscribe(season => {
      this.activeSeason = season;
      if (season) {
        this.loadUserCities();
      }
    });
  }

  async loadCities() {
    this.cityService.getCities().subscribe(cities => {
      this.cities = cities;
      if (this.map) {
        this.addCitiesToMap();
      }
    });
  }

  async loadUserCities() {
    if (!this.activeSeason) return;
    this.cityService.getUserCities(this.userId, this.activeSeason.id).subscribe(cities => {
      this.userCities = cities;
    });
  }

  initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('Map element not found');
      return;
    }

    // Crear mapa
    this.map = L.map('map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true
    });

    // Agregar capa de tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      minZoom: 2
    }).addTo(this.map);

    // CRÍTICO: Forzar recalculo del tamaño después de agregar tiles
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(true);
        console.log('Mapa invalidado y redimensionado');
      }
    }, 250);

    console.log('Mapa inicializado');
  }

  addCitiesToMap() {
    if (!this.map) return;

    this.cities.forEach(city => {
      const isOwned = city.ownership && city.ownership.length > 0;
      const isOwnedByUser = isOwned && city.ownership ? city.ownership[0].owner_id === this.userId : false;

      let color = '#3388ff';
      if (isOwnedByUser) color = '#22c55e';
      else if (isOwned) color = '#ef4444';

      const marker = L.circleMarker([city.latitude, city.longitude], {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.8
      }).addTo(this.map);

      marker.bindPopup(this.createPopupContent(city, !isOwned, isOwnedByUser));
    });

    console.log(`${this.cities.length} ciudades agregadas al mapa`);
  }

  createPopupContent(city: City, isOwned: boolean, isOwnedByUser: boolean): string {
    let content = `<div style="min-width: 180px;"><h4 style="margin: 0 0 8px 0;">${city.name}</h4>`;
    content += `<p style="margin: 4px 0; font-size: 0.9rem;">💰 Precio: $${city.base_price}</p>`;
    
    if (!isOwned) {
      content += `<button style="width: 100%; padding: 8px; margin-top: 8px; background: #22c55e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;" onclick="window.purchaseCity('${city.id}')">Comprar Ciudad</button>`;
    } else if (city.ownership && city.ownership[0]) {
      content += `<p style="margin: 4px 0; font-size: 0.9rem;">👤 Dueño: ${city.ownership[0].owner?.username || 'Desconocido'}</p>`;
      if (!isOwnedByUser) {
        content += `<button style="width: 100%; padding: 8px; margin-top: 8px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;" onclick="window.attackCity('${city.id}')">⚔️ Invadir</button>`;
      }
    }
    
    content += `</div>`;
    return content;
  }

  setupGlobalFunctions() {
    (window as any).purchaseCity = async (cityId: string) => {
      await this.purchaseCity(cityId);
    };

    (window as any).attackCity = (cityId: string) => {
      alert('Sistema de invasión próximamente...');
    };
  }

  async purchaseCity(cityId: string) {
    if (!this.activeSeason) {
      alert('No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city) return;

    const confirm = window.confirm(`¿Comprar ${city.name} por $${city.base_price}?`);
    if (!confirm) return;

    try {
      await this.cityService.purchaseCity(cityId, this.activeSeason.id, this.userId);
      alert('¡Ciudad comprada exitosamente!');
      
      await this.loadUserProfile();
      await this.loadUserCities();
      
      // Limpiar marcadores
      this.map.eachLayer((layer: any) => {
        if (layer instanceof L.CircleMarker) {
          this.map.removeLayer(layer);
        }
      });
      
      await this.loadCities();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}