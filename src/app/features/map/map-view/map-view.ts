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
  map!: L.Map;
  cities: City[] = [];
  activeSeason: Season | null = null;
  selectedCity: City | null = null;
  userCities: City[] = [];
  
  // Stats
  totalCities: number = 0;
  totalInhabitants: number = 0;
  mapInitialized = false;

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
    // Esperar que el DOM esté listo
    setTimeout(() => {
      const mapElement = document.getElementById('map');
      if (mapElement && !this.mapInitialized) {
        this.initMap();
        this.loadCities();
      }
    }, 300);
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  async loadUserProfile() {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .single();

    if (data) {
      this.username = data.username || data.display_name || 'Conquistador';
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
    this.cityService.getCities().subscribe({
      next: (cities) => {
        console.log('Ciudades cargadas:', cities);
        this.cities = cities;
        if (this.map && cities.length > 0) {
          this.addCitiesToMap();
        }
      },
      error: (error) => {
        console.error('Error cargando ciudades:', error);
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
    if (this.mapInitialized) return;

    try {
      // Configuración del mapa con límites
      this.map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        maxBounds: [[-90, -180], [90, 180]], // Límites del mundo
        maxBoundsViscosity: 1.0, // Evita que se salga del mundo
        worldCopyJump: false, // No repetir el mapa
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true
      });

      // Tile layer optimizado
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
        noWrap: true, // No repetir el mapa horizontalmente
        bounds: [[-90, -180], [90, 180]]
      }).addTo(this.map);

      this.mapInitialized = true;
      console.log('Mapa inicializado correctamente');

      // Forzar que el mapa se redibuje
      setTimeout(() => {
        this.map.invalidateSize();
      }, 100);

    } catch (error) {
      console.error('Error inicializando mapa:', error);
    }
  }

  addCitiesToMap() {
    if (!this.map || !this.mapInitialized) {
      console.log('Mapa no está listo aún');
      return;
    }

    console.log('Agregando ciudades al mapa:', this.cities.length);

    this.cities.forEach(city => {
      const isOwned = city.ownership && city.ownership.length > 0;
      const isOwnedByUser = isOwned && city.ownership ? city.ownership[0].owner_id === this.userId : false;

      let markerColor = '#3388ff'; // Azul (disponible)
      if (isOwnedByUser) {
        markerColor = '#22c55e'; // Verde (tuya)
      } else if (isOwned) {
        markerColor = '#ef4444'; // Rojo (de otro)
      }

      // Crear marcador simple
      const circleMarker = L.circleMarker([city.latitude, city.longitude], {
        radius: this.getMarkerSize(city.rarity),
        fillColor: markerColor,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(this.map);

      // Popup
      const popupContent = this.createPopupContent(city, isOwned || false, isOwnedByUser);
      circleMarker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
      });

      // Evento de click
      circleMarker.on('click', () => {
        this.selectedCity = city;
        console.log('Ciudad seleccionada:', city);
      });
    });

    console.log('Ciudades agregadas al mapa');
  }

  getMarkerSize(rarity: string): number {
    switch(rarity) {
      case 'legendary': return 12;
      case 'epic': return 10;
      case 'rare': return 8;
      default: return 6;
    }
  }

  createPopupContent(city: City, isOwned: boolean, isOwnedByUser: boolean): string {
    const rarityEmoji: Record<string, string> = {
      'common': '⚪',
      'rare': '🔵',
      'epic': '🟣',
      'legendary': '🟡'
    };

    const typeEmoji: Record<string, string> = {
      'capital': '👑',
      'port': '⚓',
      'island': '🏝️',
      'normal': '🏙️'
    };

    let content = `
      <div class="city-popup">
        <h3>${city.name} ${typeEmoji[city.city_type]}</h3>
        <p><strong>País:</strong> ${city.country?.name || 'Desconocido'}</p>
        <p><strong>Rareza:</strong> ${rarityEmoji[city.rarity]} ${city.rarity.toUpperCase()}</p>
        <p><strong>Población:</strong> ${city.real_population.toLocaleString()}</p>
    `;

    if (isOwned && city.ownership && city.ownership.length > 0) {
      const ownership = city.ownership[0];
      content += `
        <hr style="margin: 10px 0;">
        <p><strong>Dueño:</strong> ${ownership.owner?.username || 'Desconocido'}</p>
        <p><strong>Habitantes Virtuales:</strong> ${ownership.virtual_inhabitants.toLocaleString()}</p>
        <p><strong>Nivel:</strong> ${ownership.city_level}</p>
      `;
      
      if (!isOwnedByUser) {
        content += `<button class="btn-attack" onclick="window.attackCity('${city.id}')">⚔️ Invadir</button>`;
      }
    } else {
      content += `
        <hr style="margin: 10px 0;">
        <p><strong>Precio:</strong> $${city.base_price.toFixed(2)} USD</p>
        <button class="btn-buy" onclick="window.purchaseCity('${city.id}')">💰 Comprar</button>
      `;
    }

    content += `</div>`;
    return content;
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }

  setupGlobalFunctions() {
    (window as any).purchaseCity = async (cityId: string) => {
      await this.purchaseCity(cityId);
    };

    (window as any).attackCity = (cityId: string) => {
      this.attackCity(cityId);
    };
  }

  async purchaseCity(cityId: string) {
    if (!this.activeSeason) {
      alert('No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city) return;

    const confirmPurchase = confirm(`¿Comprar ${city.name} por $${city.base_price}? (Simulación - sin pago real)`);
    if (!confirmPurchase) return;

    try {
      await this.cityService.purchaseCity(cityId, this.activeSeason.id, this.userId);
      alert('¡Ciudad comprada con éxito!');
      
      // Recargar datos
      await this.loadUserProfile();
      await this.loadUserCities();
      
      // Limpiar y recargar mapa
      this.map.eachLayer((layer) => {
        if (layer instanceof L.CircleMarker) {
          this.map.removeLayer(layer);
        }
      });
      
      await this.loadCities();
      
    } catch (error: any) {
      console.error('Error comprando ciudad:', error);
      alert('Error: ' + error.message);
    }
  }

  async attackCity(cityId: string) {
    alert('Sistema de invasión en desarrollo...');
  }
}