import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LocalScanBusiness } from '../types';
import { businessesWithCoordinates, isServiceAreaBusiness } from '../location-utils';

interface LocationMapProps {
  businesses: LocalScanBusiness[];
  centerLat: number | null;
  centerLng: number | null;
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function buildRankIcon(rank: number, selected: boolean, sab: boolean): L.DivIcon {
  const sabTag = sab ? '<span class="local-scan-leaflet-sab">SAB</span>' : '';
  return L.divIcon({
    className: 'local-scan-leaflet-pin-shell',
    html: `<div class="local-scan-leaflet-pin${selected ? ' is-selected' : ''}">${rank}${sabTag}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

const searchCenterIcon = L.divIcon({
  className: 'local-scan-leaflet-center-shell',
  html: '<div class="local-scan-leaflet-center" aria-hidden="true"><span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitMapBounds({
  points,
  centerLat,
  centerLng,
}: {
  points: Array<{ lat: number; lng: number }>;
  centerLat: number | null;
  centerLng: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);
    for (const point of points) {
      bounds.extend([point.lat, point.lng]);
    }
    if (centerLat != null && centerLng != null) {
      bounds.extend([centerLat, centerLng]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    }
  }, [map, points, centerLat, centerLng]);

  return null;
}

function PanToSelection({
  selectedPlaceId,
  businesses,
}: {
  selectedPlaceId: string | null;
  businesses: Array<LocalScanBusiness & { lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPlaceId) return;
    const business = businesses.find((b) => b.placeId === selectedPlaceId);
    if (!business) return;
    map.panTo([business.lat, business.lng], { animate: true });
  }, [map, selectedPlaceId, businesses]);

  return null;
}

function RankMarker({
  business,
  selected,
  onSelect,
}: {
  business: LocalScanBusiness & { lat: number; lng: number };
  selected: boolean;
  onSelect: (placeId: string) => void;
}) {
  const sab = isServiceAreaBusiness(business);
  const icon = useMemo(
    () => buildRankIcon(business.rank, selected, sab),
    [business.rank, selected, sab]
  );

  return (
    <Marker
      position={[business.lat, business.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : business.rank}
      eventHandlers={{
        click: () => onSelect(business.placeId),
      }}
    >
      <Tooltip direction="top" offset={[0, -14]} opacity={0.95} className="local-scan-leaflet-tooltip">
        #{business.rank} {business.name}
      </Tooltip>
    </Marker>
  );
}

export function LocationMap({
  businesses,
  centerLat,
  centerLng,
  selectedPlaceId,
  onSelect,
}: LocationMapProps) {
  const points = useMemo(() => businessesWithCoordinates(businesses), [businesses]);

  const mapCenter = useMemo(() => {
    if (centerLat != null && centerLng != null) return [centerLat, centerLng] as [number, number];
    if (points[0]) return [points[0].lat, points[0].lng] as [number, number];
    return [25.7617, -80.1918] as [number, number];
  }, [centerLat, centerLng, points]);

  if (!points.length && (centerLat == null || centerLng == null)) {
    return <p className="local-scan-meta">No coordinates available to render a map.</p>;
  }

  return (
    <div className="local-scan-leaflet-wrap">
      <MapContainer
        center={mapCenter}
        zoom={11}
        scrollWheelZoom
        className="local-scan-leaflet-map"
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitMapBounds points={points} centerLat={centerLat} centerLng={centerLng} />
        <PanToSelection selectedPlaceId={selectedPlaceId} businesses={points} />
        {centerLat != null && centerLng != null ? (
          <Marker
            position={[centerLat, centerLng]}
            icon={searchCenterIcon}
            zIndexOffset={-500}
            interactive={false}
          />
        ) : null}
        {points.map((business) => (
          <RankMarker
            key={business.placeId}
            business={business}
            selected={selectedPlaceId === business.placeId}
            onSelect={onSelect}
          />
        ))}
      </MapContainer>
    </div>
  );
}
