import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CityService, City } from '../../../core/services/city.service';
import { SeasonService, Season } from '../../../core/services/season.service';
import { InvasionService } from '../../../core/services/invasion.service';
import { InvasionResolverService } from '../../../core/services/invasion-resolver.service'; // NUEVO
import { EventsFeedComponent } from '../../../shared/components/events-feed/events-feed';

import * as L from 'leaflet';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule, EventsFeedComponent],
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
  conqueredCountries: number = 0;

  constructor(
    private supabase: SupabaseService,
    private cityService: CityService,
    private seasonService: SeasonService,
    private invasionService: InvasionService,
    private invasionResolver: InvasionResolverService, // NUEVO
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

    // INICIAR AUTO-RESOLVER DE INVASIONES
    this.invasionResolver.startAutoResolver();
    console.log('🎲 Sistema de auto-resolución de invasiones activado');
  }

  ngAfterViewInit() {
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

    // DETENER AUTO-RESOLVER AL SALIR
    this.invasionResolver.stopAutoResolver();
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
      this.conqueredCountries = data.conquered_countries || 0;
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

    this.map = L.map('map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      minZoom: 2
    }).addTo(this.map);

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(true);
      }
    }, 250);
  }

  addCitiesToMap() {
    if (!this.map) return;

    this.cities.forEach(city => {
      // Verificar ownership correctamente
      const hasOwnership = city.ownership && Array.isArray(city.ownership) && city.ownership.length > 0;
      const isOwned = hasOwnership ? true : false;
      const isOwnedByUser = hasOwnership && city.ownership![0].owner_id === this.userId ? true : false;


      let color = '#3388ff'; // Azul - Disponible
      if (isOwnedByUser) {
        color = '#22c55e'; // Verde - Tuya
      } else if (isOwned) {
        color = '#ef4444'; // Rojo - Enemiga
      }

      const size = this.getCitySize(city.rarity);

      const marker = L.circleMarker([city.latitude, city.longitude], {
        radius: size,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
      }).addTo(this.map);

      marker.bindPopup(this.createPopupContent(city, isOwned, isOwnedByUser), {
        maxWidth: 300,
        className: 'city-popup-container'
      });
    });

    console.log(`Total ciudades en mapa: ${this.cities.length}`);
  }

  getCitySize(rarity: string): number {
    const sizes: Record<string, number> = {
      'legendary': 12,
      'epic': 10,
      'rare': 8,
      'common': 6
    };
    return sizes[rarity] || 6;
  }

  createPopupContent(city: City, isOwned: boolean, isOwnedByUser: boolean): string {
    const rarityEmoji: Record<string, string> = {
      'legendary': '🟡',
      'epic': '🟣',
      'rare': '🔵',
      'common': '⚪'
    };

    const typeEmoji: Record<string, string> = {
      'capital': '👑',
      'port': '⚓',
      'island': '🏝️',
      'normal': '🏙️'
    };

    let content = `
      <div style="padding: 12px; min-width: 240px;">
        <h3 style="margin: 0 0 12px 0; color: #667eea; font-size: 1.2rem; display: flex; align-items: center; gap: 6px;">
          ${typeEmoji[city.city_type]} ${city.name}
        </h3>
        
        <div style="margin-bottom: 12px; background: #f8f9fa; padding: 10px; border-radius: 6px;">
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>🌍 País:</strong> ${city.country?.name || 'Desconocido'}
          </p>
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>💎 Rareza:</strong> ${rarityEmoji[city.rarity]} ${city.rarity.toUpperCase()}
          </p>
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>👥 Población Real:</strong> ${city.real_population.toLocaleString()}
          </p>
        </div>
    `;

    if (!isOwned) {
      const virtualInhabitants = Math.floor(city.real_population * 0.1);
      content += `
        <div style="background: #ecfdf5; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #10b981;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #059669; font-size: 1rem;">
            🟢 CIUDAD DISPONIBLE
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>💰 Precio:</strong> $${city.base_price.toFixed(2)} USD
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>👥 Habitantes que obtendrás:</strong> ${virtualInhabitants.toLocaleString()}
          </p>
        </div>
        <button 
          style="
            width: 100%; 
            padding: 12px; 
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: 700;
            font-size: 1.05rem;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            transition: transform 0.2s, box-shadow 0.2s;
          "
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)'"
          onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
          onclick="window.purchaseCity('${city.id}')">
          💰 COMPRAR CIUDAD
        </button>
      `;
    } else if (isOwnedByUser && city.ownership && city.ownership[0]) {
      const ownership = city.ownership[0];
      const hasShield = ownership.shield_until && new Date(ownership.shield_until) > new Date();
      
      content += `
        <div style="background: #ecfdf5; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #10b981;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #059669; font-size: 1rem;">
            ✅ ESTA ES TU CIUDAD
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>👥 Habitantes:</strong> ${ownership.virtual_inhabitants.toLocaleString()}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>⭐ Nivel:</strong> ${ownership.city_level}
          </p>
          ${hasShield ? `
            <p style="margin: 6px 0; font-size: 0.9rem; color: #ca8a04; font-weight: 600;">
              🛡️ Escudo activo hasta ${new Date(ownership.shield_until!).toLocaleString()}
            </p>
          ` : ''}
        </div>
        <div style="text-align: center; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; color: white; font-weight: 700; font-size: 1rem;">
          👑 Ciudad bajo tu control
        </div>
      `;
    } else if (city.ownership && city.ownership[0]) {
      const ownership = city.ownership[0];
      const hasShield = ownership.shield_until && new Date(ownership.shield_until) > new Date();
      
      content += `
        <div style="background: #fef2f2; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #ef4444;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #dc2626; font-size: 1rem;">
            🔴 CIUDAD ENEMIGA
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>👤 Dueño:</strong> ${ownership.owner?.username || 'Desconocido'}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>👥 Habitantes:</strong> ${ownership.virtual_inhabitants.toLocaleString()}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>⭐ Nivel:</strong> ${ownership.city_level}
          </p>
          ${hasShield ? `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; border: 1px solid #f59e0b;">
              <p style="margin: 0; font-size: 0.85rem; color: #92400e; font-weight: 600;">
                🛡️ Escudo activo hasta:<br>
                ${new Date(ownership.shield_until!).toLocaleString()}
              </p>
            </div>
          ` : ''}
        </div>
      `;

      if (hasShield) {
        content += `
          <div style="text-align: center; padding: 12px; background: #fef3c7; border-radius: 8px; color: #92400e; font-weight: 600; border: 2px solid #f59e0b;">
            🛡️ No puedes atacar<br>Ciudad protegida
          </div>
        `;
      } else {
        content += `
          <button 
            style="
              width: 100%; 
              padding: 12px; 
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              color: white; 
              border: none; 
              border-radius: 8px; 
              cursor: pointer; 
              font-weight: 700;
              font-size: 1.05rem;
              box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
              transition: transform 0.2s, box-shadow 0.2s;
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'"
            onclick="window.attackCity('${city.id}')">
            ⚔️ INVADIR CIUDAD
          </button>
        `;
      }
    }

    content += `</div>`;
    return content;
  }

  setupGlobalFunctions() {
    (window as any).purchaseCity = async (cityId: string) => {
      await this.purchaseCity(cityId);
    };

    (window as any).attackCity = async (cityId: string) => {
      await this.attackCity(cityId);
    };
  }

  async purchaseCity(cityId: string) {
    if (!this.activeSeason) {
      alert('⚠️ No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city) return;

    const virtualInhabitants = Math.floor(city.real_population * 0.1);
    
    const confirmMessage = `
🏙️ ${city.name}
💰 Precio: $${city.base_price} USD
👥 Habitantes: ${virtualInhabitants.toLocaleString()}

¿Confirmar compra?
(Esto es una simulación - sin pago real por ahora)
    `.trim();

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    try {
      await this.cityService.purchaseCity(cityId, this.activeSeason.id, this.userId);
      
      alert(`✅ ¡${city.name} comprada exitosamente!\n\n+${virtualInhabitants.toLocaleString()} habitantes virtuales`);
      
      await this.loadUserProfile();
      await this.loadUserCities();
      this.refreshMap();
      
    } catch (error: any) {
      console.error('Error comprando ciudad:', error);
      alert(`❌ Error: ${error.message}`);
    }
  }

  async attackCity(cityId: string) {
    if (!this.activeSeason) {
      alert('⚠️ No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city || !city.ownership || city.ownership.length === 0) return;

    const defender = city.ownership[0];

    if (defender.shield_until && new Date(defender.shield_until) > new Date()) {
      const shieldEnds = new Date(defender.shield_until);
      alert(`🛡️ Esta ciudad tiene escudo activo hasta ${shieldEnds.toLocaleString()}\n\nNo puedes atacarla en este momento.`);
      return;
    }

    const attackerPower = this.userCities.reduce((sum, c) => {
      return sum + (c.ownership?.[0]?.virtual_inhabitants || 0);
    }, 0);

    if (attackerPower === 0) {
      alert('⚠️ Necesitas al menos una ciudad para atacar');
      return;
    }

    const defenderPower = defender.virtual_inhabitants;

    const conquestIndex = this.invasionService.calculateConquestIndex(
      attackerPower,
      defenderPower,
      defender.city_level,
      false
    );

    const confirmMessage = `
⚔️ INICIAR INVASIÓN

🏙️ Ciudad: ${city.name}
👤 Defensor: ${defender.owner?.username}
👥 Habitantes defensa: ${defenderPower.toLocaleString()}

📊 TU PODER DE ATAQUE: ${attackerPower.toLocaleString()}
📈 Índice de Conquista: ${conquestIndex.toFixed(1)}%

⏱️ Duración: 24 segundos (modo testing)
🎲 Probabilidad de victoria: ${conquestIndex.toFixed(1)}%

⚠️ Si pierdes, perderás el 10% de tus habitantes

¿Iniciar invasión?
    `.trim();

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    try {
      const invasion = await this.invasionService.startInvasion(
        cityId,
        this.activeSeason.id,
        this.userId,
        defender.owner_id
      );

      alert(`
⚔️ ¡INVASIÓN INICIADA!

La batalla durará 24 segundos (modo testing).
Termina: ${new Date(invasion.ends_at).toLocaleString()}

El sistema resolverá automáticamente la invasión.
      `.trim());

      this.refreshMap();

    } catch (error: any) {
      console.error('Error iniciando invasión:', error);
      alert(`❌ Error: ${error.message}`);
    }
  }

  refreshMap() {
    this.map.eachLayer((layer: any) => {
      if (layer instanceof L.CircleMarker) {
        this.map.removeLayer(layer);
      }
    });
    
    this.loadCities();
  }

  goToInvasions() {
    this.router.navigate(['/invasions']);
  }

  goToRankings() {
    this.router.navigate(['/rankings']);
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}