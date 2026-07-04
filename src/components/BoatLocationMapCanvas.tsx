import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { MapCoordinates } from "@/lib/map-locations";
import type { ResolvedBoatLocationMapPoint } from "./BoatLocationMap";

const LeafletMapContainer = MapContainer;
const LeafletTileLayer = TileLayer;
const LeafletMarker = Marker;

interface BoatLocationMapCanvasProps {
  points: ResolvedBoatLocationMapPoint[];
  selectedPointId?: string;
  onSelectPoint?: (pointId: string) => void;
  defaultCenter: MapCoordinates;
}

const createMarkerIcon = (isActive: boolean) =>
  L.divIcon({
    className: "nautiplex-map-marker-wrapper",
    html: `<span class="nautiplex-map-marker${isActive ? " is-active" : ""}"></span>`,
    iconSize: isActive ? [24, 24] : [18, 18],
    iconAnchor: isActive ? [12, 12] : [9, 9],
  });

const MapViewportController = ({ points, selectedPointId, defaultCenter }: BoatLocationMapCanvasProps) => {
  const map = useMap();

  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? points[0] ?? null;

  useEffect(() => {
    map.invalidateSize();

    if (points.length === 0) {
      map.setView([defaultCenter.lat, defaultCenter.lng], 6);
      return;
    }

    if (selectedPoint) {
      map.flyTo([selectedPoint.coordinates.lat, selectedPoint.coordinates.lng], points.length > 1 ? 11 : 13, {
        duration: 0.6,
      });
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.coordinates.lat, point.coordinates.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.18));
  }, [defaultCenter.lat, defaultCenter.lng, map, points, selectedPoint]);

  return null;
};

const BoatLocationMapCanvas = ({ points, selectedPointId, onSelectPoint, defaultCenter }: BoatLocationMapCanvasProps) => {
  const center = useMemo(() => {
    const selected = points.find((point) => point.id === selectedPointId);
    return selected?.coordinates ?? points[0]?.coordinates ?? defaultCenter;
  }, [defaultCenter, points, selectedPointId]);

  return (
    <LeafletMapContainer
      center={[center.lat, center.lng]}
      zoom={points.length > 1 ? 7 : 13}
      scrollWheelZoom
      className="h-full w-full"
      preferCanvas
    >
      <LeafletTileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewportController
        points={points}
        selectedPointId={selectedPointId}
        onSelectPoint={onSelectPoint}
        defaultCenter={defaultCenter}
      />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={38}
        zoomToBoundsOnClick
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        removeOutsideVisibleBounds
        disableClusteringAtZoom={12}
      >
        {points.map((point) => {
          const isActive = point.id === selectedPointId;
          return (
            <LeafletMarker
              key={point.id}
              position={[point.coordinates.lat, point.coordinates.lng]}
              icon={createMarkerIcon(isActive)}
              eventHandlers={{
                click: () => onSelectPoint?.(point.id),
              }}
            >
              <Popup>
                <div className="nautiplex-map-popup-card space-y-1.5">
                  <p className="font-semibold text-foreground text-xs leading-tight">{point.name}</p>
                  {point.subtitle ? <p className="text-[11px] text-muted-foreground leading-tight">{point.subtitle}</p> : null}
                  {(point.type || point.capacity || point.pricePerDay || point.rating !== undefined) ? (
                    <div className="grid grid-cols-2 gap-1">
                      {point.type ? (
                        <div className="rounded-md border border-border bg-muted/20 px-1.5 py-1">
                          <p className="text-[10px] text-muted-foreground">Type</p>
                          <p className="text-[11px] font-medium text-foreground truncate">{point.type}</p>
                        </div>
                      ) : null}
                      {point.capacity ? (
                        <div className="rounded-md border border-border bg-muted/20 px-1.5 py-1">
                          <p className="text-[10px] text-muted-foreground">Guests</p>
                          <p className="text-[11px] font-medium text-foreground">{point.capacity}</p>
                        </div>
                      ) : null}
                      {point.pricePerDay ? (
                        <div className="rounded-md border border-border bg-muted/20 px-1.5 py-1">
                          <p className="text-[10px] text-muted-foreground">Price/day</p>
                          <p className="text-[11px] font-medium text-foreground">€{point.pricePerDay}</p>
                        </div>
                      ) : null}
                      {point.rating !== undefined ? (
                        <div className="rounded-md border border-border bg-muted/20 px-1.5 py-1">
                          <p className="text-[10px] text-muted-foreground">Rating</p>
                          <p className="text-[11px] font-medium text-foreground">{point.rating.toFixed(1)}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {point.ctaHref ? (
                    <a
                      href={point.ctaHref}
                      className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-accent px-2 py-1 text-[11px] font-medium text-accent-foreground"
                    >
                      {point.ctaLabel ?? "View boat"}
                    </a>
                  ) : null}
                </div>
              </Popup>
            </LeafletMarker>
          );
        })}
      </MarkerClusterGroup>
    </LeafletMapContainer>
  );
};

export default BoatLocationMapCanvas;
