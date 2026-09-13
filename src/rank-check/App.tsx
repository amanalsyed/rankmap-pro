import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePlanCapabilities } from '../hooks/usePlanCapabilities';

const GRID_SIZE = 3;
const GRID_SPACING_KM = 2;

interface BusinessData {
  name: string;
  address: string;
  businessAge: string;
  latitude: number;
  longitude: number;
  keyword: string;
  placeId?: string;
}

interface RankCompetitor {
  rank: number;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  isTarget: boolean;
}

interface RankCheckResponse {
  rank: number | null;
  totalResults: number;
  competitors: RankCompetitor[];
  notFound: boolean;
  cached: boolean;
  error?: string;
}

type PinStatus = 'checking' | 'done' | 'error';

interface RankPin {
  id: string;
  lat: number;
  lng: number;
  distance: number;
  status: PinStatus;
  rank: number | null;
  notFound: boolean;
  totalResults: number;
  competitors: RankCompetitor[];
  cached: boolean;
  error?: string;
  keyword: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPinId(): string {
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Red pin for the target business location. */
function businessPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'rank-pin rank-pin-business',
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    html: `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 9.2 13 25 13 25s13-15.8 13-25c0-7.18-5.82-13-13-13z" fill="#ea4335"/>
      <circle cx="13" cy="13" r="5" fill="#fff"/>
    </svg>`,
  });
}

/** Pulsing blue dot while a rank check is in flight. */
function checkingPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'rank-pin rank-pin-checking',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="rank-checking-dot" aria-hidden="true"></div>`,
  });
}

function rankPinColor(rank: number | null, notFound: boolean): string {
  if (notFound || rank === null) return '#ea4335';
  if (rank <= 3) return '#34a853';
  if (rank <= 10) return '#f9ab00';
  return '#ea4335';
}

function rankPinLabel(rank: number | null, notFound: boolean, status: PinStatus): string {
  if (status === 'checking') return '…';
  if (status === 'error') return '!';
  if (notFound || rank === null) return '—';
  return String(rank);
}

function rankPinTooltip(pin: RankPin): string {
  if (pin.status === 'checking') return 'Checking rank…';
  if (pin.error) return pin.error;
  if (pin.notFound || pin.rank === null) {
    return `Not in the top ${pin.totalResults || 20} for “${pin.keyword}”`;
  }
  return `#${pin.rank} for “${pin.keyword}” · ${formatDistance(pin.distance)} from business`;
}

/** Colored circle with the rank number, matching GMB Everywhere's check pins. */
function rankBadgeIcon(pin: RankPin, selected: boolean): L.DivIcon {
  const fill =
    pin.status === 'checking' || pin.status === 'error'
      ? pin.status === 'error'
        ? '#ea4335'
        : '#1a73e8'
      : rankPinColor(pin.rank, pin.notFound);
  const label = rankPinLabel(pin.rank, pin.notFound, pin.status);
  const selectedClass = selected ? ' rank-badge-selected' : '';
  return L.divIcon({
    className: 'rank-pin rank-pin-badge',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="rank-badge${selectedClass}" style="background:${fill}">${escapeHtml(label)}</div>`,
  });
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  const miles = km * 0.621371;
  if (km < 1) {
    return `${miles.toFixed(2)} mi (${Math.round(km * 1000)} m)`;
  }
  return `${miles.toFixed(2)} mi (${km.toFixed(2)} km)`;
}

function formatReviews(count: number | null): string {
  if (count === null) return '';
  return `${count.toLocaleString()} review${count === 1 ? '' : 's'}`;
}

function formatRankSummary(rank: number | null, notFound: boolean, status: PinStatus): string {
  if (status === 'checking') return '…';
  if (status === 'error') return 'Error';
  if (notFound || rank === null) return 'Not found';
  return `#${rank}`;
}

function gridOffsets(size: number, spacingKm: number, centerLat: number): { lat: number; lng: number }[] {
  const half = Math.floor(size / 2);
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const points: { lat: number; lng: number }[] = [];

  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      if (row === 0 && col === 0) continue;
      points.push({
        lat: (row * spacingKm) / kmPerDegLat,
        lng: (col * spacingKm) / kmPerDegLng,
      });
    }
  }

  return points;
}

function App() {
  const { capabilities, plan } = usePlanCapabilities();
  const maxPins = capabilities.rankCheckMaxPins;
  const [businessData, setBusinessData] = useState<BusinessData | null>(null);
  const [keyword, setKeyword] = useState('');
  const [pins, setPins] = useState<RankPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pinLimitNotice, setPinLimitNotice] = useState('');
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const selectedPin = pins.find((p) => p.id === selectedPinId) ?? null;
  const checkingCount = pins.filter((p) => p.status === 'checking').length;

  const updatePin = useCallback((id: string, patch: Partial<RankPin>) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const runRankCheck = useCallback(
    async (pinId: string, lat: number, lng: number, kw: string, business: BusinessData) => {
      const distance = haversineKm(business.latitude, business.longitude, lat, lng);

      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'CHECK_RANK',
          request: {
            businessName: business.name,
            keyword: kw.trim(),
            latitude: lat,
            longitude: lng,
            placeId: business.placeId,
          },
        })) as RankCheckResponse | undefined;

        if (!response) throw new Error('No response from the extension background.');

        updatePin(pinId, {
          status: response.error ? 'error' : 'done',
          rank: response.error ? null : response.rank,
          notFound: response.notFound,
          totalResults: response.totalResults,
          competitors: response.competitors,
          cached: response.cached,
          error: response.error,
          distance,
        });
      } catch (error) {
        updatePin(pinId, {
          status: 'error',
          rank: null,
          notFound: true,
          totalResults: 0,
          competitors: [],
          cached: false,
          distance,
          error: error instanceof Error ? error.message : 'Rank check failed.',
        });
      }
    },
    [updatePin]
  );

  const addPinAt = useCallback(
    (lat: number, lng: number) => {
      if (!businessData) return false;

      const trimmedKeyword = keyword.trim();
      if (!trimmedKeyword) {
        setPinLimitNotice('Enter a search keyword in Step 1 first.');
        return false;
      }

      if (pinsRef.current.length >= maxPins) {
        setPinLimitNotice(
          maxPins <= 1
            ? `Your ${plan} plan allows 1 rank pin. Upgrade for multi-pin grid checks.`
            : `Maximum ${maxPins} pins. Remove some or clear all to add more.`
        );
        return false;
      }

      setPinLimitNotice('');

      const id = createPinId();
      const distance = haversineKm(businessData.latitude, businessData.longitude, lat, lng);
      const newPin: RankPin = {
        id,
        lat,
        lng,
        distance,
        status: 'checking',
        rank: null,
        notFound: false,
        totalResults: 0,
        competitors: [],
        cached: false,
        keyword: trimmedKeyword,
      };

      setPins((prev) => {
        const next = [...prev, newPin];
        pinsRef.current = next;
        return next;
      });
      setSelectedPinId(id);
      void runRankCheck(id, lat, lng, trimmedKeyword, businessData);
      return true;
    },
    [businessData, keyword, runRankCheck, maxPins, plan]
  );

  const handleMapClick = (lat: number, lng: number) => {
    addPinAt(lat, lng);
  };

  const handleGenerateGrid = () => {
    if (!businessData) return;

    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setPinLimitNotice('Enter a search keyword in Step 1 first.');
      return;
    }

    if (maxPins < GRID_SIZE * GRID_SIZE) {
      setPinLimitNotice(`3×3 rank grid requires a paid plan. You have a ${maxPins}-pin limit on ${plan}.`);
      return;
    }

    const offsets = gridOffsets(GRID_SIZE, GRID_SPACING_KM, businessData.latitude);
    const room = maxPins - pinsRef.current.length;
    const toAdd = offsets.slice(0, room);

    if (toAdd.length === 0) {
      setPinLimitNotice(`Maximum ${maxPins} pins reached. Clear pins to generate a grid.`);
      return;
    }

    if (toAdd.length < offsets.length) {
      setPinLimitNotice(`Added ${toAdd.length} grid pins (${maxPins} pin limit).`);
    } else {
      setPinLimitNotice('');
    }

    const newPins: RankPin[] = toAdd.map((offset) => {
      const lat = businessData.latitude + offset.lat;
      const lng = businessData.longitude + offset.lng;
      return {
        id: createPinId(),
        lat,
        lng,
        distance: haversineKm(businessData.latitude, businessData.longitude, lat, lng),
        status: 'checking' as const,
        rank: null,
        notFound: false,
        totalResults: 0,
        competitors: [],
        cached: false,
        keyword: trimmedKeyword,
      };
    });

    setPins((prev) => {
      const next = [...prev, ...newPins];
      pinsRef.current = next;
      return next;
    });
    setSelectedPinId(newPins[newPins.length - 1]?.id ?? null);

    for (const pin of newPins) {
      void runRankCheck(pin.id, pin.lat, pin.lng, trimmedKeyword, businessData);
    }
  };

  const handleRemovePin = (id: string) => {
    setPins((prev) => {
      const next = prev.filter((p) => p.id !== id);
      pinsRef.current = next;
      return next;
    });
    setSelectedPinId((current) => (current === id ? null : current));
    setPinLimitNotice('');
  };

  const handleClearAll = () => {
    setPins([]);
    pinsRef.current = [];
    setSelectedPinId(null);
    setPinLimitNotice('');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') ?? '';
    const address = (params.get('address') ?? '').replace(/^address not found$/i, '').trim();
    const businessAge = params.get('businessAge') ?? '';
    const lat = Number.parseFloat(params.get('lat') ?? '');
    const lng = Number.parseFloat(params.get('lng') ?? '');
    const defaultKeyword = params.get('keyword') ?? '';
    const placeId = params.get('placeId') ?? '';

    if (!name) {
      setLoadError('No business was passed to this page. Open it from a Check Rank button.');
      return;
    }
    setKeyword(defaultKeyword);

    const applyBusiness = (data: Omit<BusinessData, 'keyword'> & { keyword?: string }) => {
      setBusinessData({
        name: data.name,
        address: data.address,
        businessAge: data.businessAge,
        latitude: data.latitude,
        longitude: data.longitude,
        keyword: data.keyword ?? defaultKeyword,
        placeId: data.placeId,
      });
    };

    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      applyBusiness({ name, address, businessAge, latitude: lat, longitude: lng, placeId });
      return;
    }

    void chrome.runtime
      .sendMessage({ type: 'LOCATE_BUSINESS', query: { name, address, placeId } })
      .then((found: { latitude: number; longitude: number; address: string } | null) => {
        if (!found) {
          setLoadError(`Could not find “${name}” on Google Maps, so its location is unknown.`);
          return;
        }
        applyBusiness({
          name,
          address: address || found.address,
          businessAge,
          latitude: found.latitude,
          longitude: found.longitude,
          placeId,
        });
      })
      .catch(() => setLoadError(`Could not look up the location of “${name}”.`));
  }, []);

  if (loadError) {
    return (
      <div className="rank-check-loading">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!businessData) {
    return (
      <div className="rank-check-loading">
        <div className="spinner" />
        <p>Finding this business on Google Maps…</p>
      </div>
    );
  }

  const donePins = pins.filter((p) => p.status === 'done' && !p.error && p.rank !== null);
  const avgRank =
    donePins.length > 0
      ? (donePins.reduce((sum, p) => sum + (p.rank ?? 0), 0) / donePins.length).toFixed(1)
      : null;

  return (
    <div className="rank-check-container">
      <header className="rank-check-header">
        <div className="header-content">
          <h1>
            {businessData.name}
            <span className="rank-check-title-suffix"> — Rank Check</span>
          </h1>
          {businessData.businessAge && <p className="business-age">{businessData.businessAge}</p>}
          {businessData.address && <p className="business-address">{businessData.address}</p>}
          <p className="header-tagline">
            Drop multiple pins to see how this business ranks across different locations.
          </p>
        </div>
      </header>

      <div className="rank-check-body">
        <div className="map-section">
          <div className="map-controls">
            <div className="step-header">
              <span className="step-number">Step 1:</span>
              <span className="step-text">Enter the search term you want to check the rank for.</span>
            </div>
            <div className="keyword-input-group">
              <input
                type="text"
                id="keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Plumber"
                className="keyword-input"
              />
            </div>

            <div className="step-header">
              <span className="step-number">Step 2:</span>
              <span className="step-text">
                Click the map to add rank-check pins. Each pin shows the rank at that location.
              </span>
            </div>

            <div className="map-toolbar">
              <button type="button" className="map-toolbar-btn" onClick={handleGenerateGrid}>
                Generate {GRID_SIZE}×{GRID_SIZE} grid
              </button>
              {pins.length > 0 && (
                <button type="button" className="map-toolbar-btn map-toolbar-btn-muted" onClick={handleClearAll}>
                  Clear all pins ({pins.length})
                </button>
              )}
            </div>

            {pinLimitNotice ? <p className="map-notice">{pinLimitNotice}</p> : null}
          </div>

          <div className="map-container">
            <MapContainer
              center={[businessData.latitude, businessData.longitude]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <Marker position={[businessData.latitude, businessData.longitude]} icon={businessPinIcon()}>
                <Tooltip direction="top" offset={[0, -38]} className="rank-map-tooltip">
                  {businessData.name}
                </Tooltip>
              </Marker>

              {pins.map((pin) => (
                <Marker
                  key={pin.id}
                  position={[pin.lat, pin.lng]}
                  icon={
                    pin.status === 'checking'
                      ? checkingPinIcon()
                      : rankBadgeIcon(pin, pin.id === selectedPinId)
                  }
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      setSelectedPinId(pin.id);
                    },
                  }}
                >
                  {pin.status !== 'checking' && (
                    <Tooltip direction="top" offset={[0, -20]} className="rank-map-tooltip">
                      {rankPinTooltip(pin)}
                    </Tooltip>
                  )}
                </Marker>
              ))}

              <MapClickHandler onMapClick={handleMapClick} />
            </MapContainer>

            {selectedPin && (
              <div className="distance-badge">
                Selected pin is {formatDistance(selectedPin.distance)} from the business
              </div>
            )}

            {checkingCount > 0 && (
              <div className="checking-badge">
                Checking {checkingCount} pin{checkingCount === 1 ? '' : 's'}…
              </div>
            )}

            <div className="map-legend">
              <span className="legend-item">
                <span className="legend-dot legend-dot-top3" /> Top 3
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-dot-mid" /> Rank 4–10
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-dot-low" /> Rank 11+ or not found
              </span>
            </div>
          </div>
        </div>

        <div className="results-section">
          {pins.length === 0 && (
            <div className="results-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <h3>Multi-pin rank check</h3>
              <p>
                Click anywhere on the map to add pins and see where this business ranks for
                {keyword ? ` “${keyword}”` : ' your keyword'} at each location. Use Generate grid
                for a quick neighborhood scan.
              </p>
            </div>
          )}

          {pins.length > 0 && (
            <div className="results-content">
              <div className="results-header">
                <span className="rank-summary-pill">
                  {pins.length} pin{pins.length === 1 ? '' : 's'}
                  {avgRank ? ` · avg #${avgRank}` : ''}
                </span>
                <button type="button" className="reset-btn" onClick={handleClearAll}>
                  Clear all
                </button>
              </div>

              <div className="pin-list">
                {pins.map((pin, index) => (
                  <div
                    key={pin.id}
                    className={`pin-list-item ${pin.id === selectedPinId ? 'is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="pin-list-main"
                      onClick={() => setSelectedPinId(pin.id)}
                    >
                      <span
                        className="pin-list-rank"
                        style={{
                          background:
                            pin.status === 'checking'
                              ? '#1a73e8'
                              : pin.status === 'error'
                                ? '#ea4335'
                                : rankPinColor(pin.rank, pin.notFound),
                        }}
                      >
                        {formatRankSummary(pin.rank, pin.notFound, pin.status)}
                      </span>
                      <span className="pin-list-meta">
                        <strong>Pin {index + 1}</strong>
                        <span>{formatDistance(pin.distance)}</span>
                        {pin.cached && pin.status === 'done' ? (
                          <span className="pin-list-cached">cached</span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="pin-list-remove"
                      aria-label={`Remove pin ${index + 1}`}
                      onClick={() => handleRemovePin(pin.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {selectedPin && (
                <div className="pin-detail">
                  {selectedPin.error ? (
                    <div className="rank-not-found pin-detail-message">
                      <h4>Could not check rank</h4>
                      <p>{selectedPin.error}</p>
                    </div>
                  ) : selectedPin.status === 'checking' ? (
                    <div className="results-loading pin-detail-loading">
                      <div className="spinner" />
                      <p>Checking rank at pin {pins.findIndex((p) => p.id === selectedPin.id) + 1}…</p>
                    </div>
                  ) : selectedPin.notFound ? (
                    <div className="rank-not-found pin-detail-message">
                      <h4>Not in the top {selectedPin.totalResults || 20}</h4>
                      <p>
                        {businessData.name} did not appear in the {selectedPin.totalResults} results
                        for “{selectedPin.keyword}” at this pin.
                      </p>
                    </div>
                  ) : null}

                  {selectedPin.competitors.length > 0 && (
                    <div className="competitors-list">
                      {selectedPin.competitors.map((comp) => (
                        <div
                          key={`${selectedPin.id}-${comp.rank}-${comp.name}`}
                          className={`competitor-item ${comp.isTarget ? 'is-target' : ''}`}
                        >
                          <div className="competitor-rank">{comp.rank}</div>
                          <div className="competitor-info">
                            <div className="competitor-name">{comp.name}</div>
                            {comp.address && <div className="competitor-address">{comp.address}</div>}
                            <div className="competitor-rating">
                              {comp.rating !== null && <span>★ {comp.rating}</span>}
                              {comp.reviewCount !== null && <span>{formatReviews(comp.reviewCount)}</span>}
                              {comp.category && <span>{comp.category}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!selectedPin && pins.length > 0 && (
                <div className="pin-detail-hint">
                  Select a pin to see competitors at that location.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
