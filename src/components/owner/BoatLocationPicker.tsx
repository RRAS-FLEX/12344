import { useEffect, useMemo, useState } from "react";
import { Anchor, Navigation, MapPin } from "lucide-react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase, type DatabaseTables } from "@/lib/supabase";
import type { MapCoordinates, ReverseGeocodeResult } from "@/lib/map-locations";
import { getDefaultMapCoordinates, reverseGeocodeCoordinates, resolveMapCoordinates } from "@/lib/map-locations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface BoatLocationPickerValue {
  departureMarina: string;
  location: string;
  mapQuery: string;
}

interface BoatLocationPickerProps {
  value: BoatLocationPickerValue;
  onChange: (next: BoatLocationPickerValue) => void;
}

// react-leaflet v4's prop types don't line up with this file's v3-style usage
// (whenCreated, raw coordinate arrays); casting the components themselves is the
// narrow, contained way to bridge that without touching the working map behavior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LeafletMap = MapContainer as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LeafletTileLayer = TileLayer as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LeafletMarker = Marker as any;

const createMarkerIcon = () =>
  L.divIcon({
    className: "nautiplex-map-marker-wrapper",
    html: '<span class="nautiplex-map-marker is-active"></span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const ViewController = ({ center }: { center: MapCoordinates }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], 13);
  }, [center.lat, center.lng, map]);
  return null;
};

interface SavedLocationRow {
  id: string;
  name: string;
  location: string;
  mapQuery: string;
}

const isBrowser = typeof window !== "undefined";

const BoatLocationPicker = ({ value, onChange }: BoatLocationPickerProps) => {
  const [savedLocations, setSavedLocations] = useState<SavedLocationRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [coords, setCoords] = useState<MapCoordinates | null>(null);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(value.location || "");
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("boat_locations")
        .select("id, name, location, map_query")
        .order("location", { ascending: true });

      if (!cancelled && !error && Array.isArray(data)) {
        setSavedLocations(
          data.map((row) => ({
            id: row.id,
            name: row.name,
            location: row.location,
            mapQuery: row.map_query,
          })),
        );
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ensureCoords = async () => {
      if (coords) return;
      const baseQuery = (value.mapQuery || `${value.departureMarina || value.location}`).trim();

      // 1) If this boat already has a specific location, honor it.
      if (baseQuery) {
        const resolved = await resolveMapCoordinates(baseQuery);
        if (!cancelled) {
          setCoords(resolved);
        }
        return;
      }

      // 2) Otherwise, if there are saved marinas, default to the first one.
      if (savedLocations.length > 0) {
        const first = savedLocations[0];
        const query = (first.mapQuery || first.location || "Greece").trim();
        const resolved = await resolveMapCoordinates(query);
        if (!cancelled) {
          setCoords(resolved);
          setCity(first.location);
          setAddress(first.mapQuery || "");
          onChange({
            departureMarina: first.name,
            location: first.location,
            mapQuery: first.mapQuery,
          });
        }
        return;
      }

      // 3) Fallback: generic default center if nothing else is available.
      const fallback = getDefaultMapCoordinates();
      if (!cancelled) {
        setCoords(fallback);
      }
    };

    void ensureCoords();

    return () => {
      cancelled = true;
    };
  }, [coords, value.departureMarina, value.location, value.mapQuery, savedLocations, onChange]);

  const filteredMarinas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return savedLocations.slice(0, 8);
    return savedLocations
      .filter((loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.location.toLowerCase().includes(term),
      )
      .slice(0, 10);
  }, [savedLocations, searchTerm]);

  const handleMapClick = async (latlng: MapCoordinates) => {
    setCoords(latlng);
    const reverse: ReverseGeocodeResult = await reverseGeocodeCoordinates(latlng);
    setAddress(reverse.address || "");
    if (reverse.city) {
      setCity(reverse.city);
    }

    const next: BoatLocationPickerValue = {
      departureMarina: value.departureMarina || reverse.city || value.location,
      location: reverse.city || value.location,
      mapQuery: reverse.address || value.mapQuery,
    };
    onChange(next);
  };

  const handleUseMyLocation = () => {
    if (!isBrowser || !navigator.geolocation) {
      return;
    }

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsGeolocating(false);
        const nextCoords: MapCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        await handleMapClick(nextCoords);
      },
      () => {
        setIsGeolocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleSaveLocation = async () => {
    const name = (value.departureMarina || "").trim();
    const area = (city || value.location || "").trim();
    const query = (value.mapQuery || address || "").trim();

    if (!name || !area || !query) {
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from("boat_locations")
        .insert({ name, location: area, map_query: query })
        .select()
        .single();

      const row = data as DatabaseTables["boat_locations"]["Row"] | null;
      if (!error && row) {
        const created: SavedLocationRow = {
          id: row.id,
          name: row.name,
          location: row.location,
          mapQuery: row.map_query,
        };
        setSavedLocations((current) => [...current, created]);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!coords) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Loading map…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-3 items-start">
        <div className="space-y-2">
          <div className="rounded-xl border border-border overflow-hidden bg-muted/30">
            <LeafletMap
              center={[coords.lat, coords.lng]}
              zoom={13}
              scrollWheelZoom
              className="h-52 w-full"
              preferCanvas
              whenCreated={(map: L.Map) => {
                setTimeout(() => map.invalidateSize(), 0);
              }}
            >
              <LeafletTileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ViewController center={coords} />
              <LeafletMarker
                position={[coords.lat, coords.lng]}
                icon={createMarkerIcon()}
                draggable
                eventHandlers={{
                  dragend: (event: L.LeafletEvent) => {
                    const marker = event.target as L.Marker;
                    const position = marker.getLatLng();
                    handleMapClick({ lat: position.lat, lng: position.lng });
                  },
                  click: (event: L.LeafletMouseEvent) => {
                    const position = event.latlng ?? (event.target as L.Marker).getLatLng();
                    handleMapClick({ lat: position.lat, lng: position.lng });
                  },
                }}
              />
              <LeafletMap
                center={[coords.lat, coords.lng]}
                zoom={13}
                style={{ display: "none" }}
                whenCreated={(map: L.Map) => {
                  map.on("click", (event: L.LeafletMouseEvent) => {
                    const position = event.latlng;
                    handleMapClick({ lat: position.lat, lng: position.lng });
                  });
                }}
              />
            </LeafletMap>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 flex items-center justify-center gap-1"
              onClick={handleUseMyLocation}
              disabled={isGeolocating}
            >
              <Navigation className={`h-3.5 w-3.5${isGeolocating ? " animate-spin" : ""}`} />
              {isGeolocating ? "Locating…" : "I am at the boat"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 flex items-center justify-center gap-1"
              onClick={handleSaveLocation}
              disabled={isSaving}
            >
              <Anchor className="h-3.5 w-3.5" />
              {isSaving ? "Saving…" : "Save as marina"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tap the map to drop a pin. Use "I am at the boat" to snap to your GPS location and auto-fill address.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="marina-search" className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Anchor className="h-3 w-3" /> Known marinas
            </Label>
            <Input
              id="marina-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search marinas (e.g., Alimos, Flisvos)"
              className="text-sm"
            />
            {filteredMarinas.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover text-xs shadow-sm">
                {filteredMarinas.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-muted/70"
                    onClick={async () => {
                      const coordsForLoc = await resolveMapCoordinates(loc.mapQuery);
                      setCoords(coordsForLoc);
                      setAddress(loc.mapQuery);
                      setCity(loc.location);
                      onChange({
                        departureMarina: loc.name,
                        location: loc.location,
                        mapQuery: loc.mapQuery,
                      });
                    }}
                  >
                    <MapPin className="mt-[1px] h-3 w-3 text-aegean" />
                    <div>
                      <p className="font-medium text-foreground leading-tight">{loc.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">{loc.location}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="departureMarina" className="text-xs font-medium text-muted-foreground">
              Marina name
            </Label>
            <Input
              id="departureMarina"
              value={value.departureMarina}
              onChange={(e) => onChange({ ...value, departureMarina: e.target.value })}
              placeholder="e.g., Alimos Marina Dock C"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">
              City / island
            </Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                onChange({ ...value, location: e.target.value });
              }}
              placeholder="e.g., Athens"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mapQuery" className="text-xs font-medium text-muted-foreground">
              Map search query
            </Label>
            <Input
              id="mapQuery"
              value={value.mapQuery}
              onChange={(e) => onChange({ ...value, mapQuery: e.target.value })}
              placeholder="e.g., Alimos Marina, Athens, Greece"
              className="text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export type { BoatLocationPickerValue };
export default BoatLocationPicker;

