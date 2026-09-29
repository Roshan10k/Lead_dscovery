"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
}

/**
 * Renders pins for every lead that has coordinates (Serper Places returns
 * latitude/longitude for Maps-sourced candidates; DuckDuckGo-sourced ones
 * won't have any, since that fallback path has no location data at all).
 * Uses Leaflet directly rather than react-leaflet — react-leaflet has had
 * recurring SSR/App-Router compatibility issues, and this needs the map
 * mounted exactly once on the client regardless.
 */
export function LeadsMap({ leads }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const withCoords = leads.filter(
    (l): l is Lead & { latitude: number; longitude: number } => l.latitude != null && l.longitude != null
  );

  useEffect(() => {
    if (withCoords.length === 0 || !containerRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false });
        // Standard OpenStreetMap tiles, no API key required — inverted to a
        // dark palette via CSS (see .leaflet-tile-pane in globals.css) rather
        // than using a "free" dark-tile provider. CARTO's dark_all endpoint,
        // used here previously, turned out to require an API key in
        // practice and stamped "API KEY REQUIRED" across every tile.
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }
      const map = mapRef.current;

      // Clear markers from a previous render (e.g. a new search's results).
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // A plain divIcon sidesteps Leaflet's default-marker-icon paths, which
      // break under most bundlers (including Next.js) unless reconfigured.
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#2dd4bf;border:2px solid #042f2e;box-shadow:0 0 10px 2px rgba(45,212,191,0.7)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const bounds = L.latLngBounds(withCoords.map((l) => [l.latitude, l.longitude]));
      withCoords.forEach((l) => {
        const marker = L.marker([l.latitude, l.longitude], { icon })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(l.businessName)}</strong>${l.location ? `<br/>${escapeHtml(l.location)}` : ""}`
          );
        markersRef.current.push(marker);
      });
      map.fitBounds(bounds, { padding: [28, 28] });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (withCoords.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl shadow-card ring-1 ring-white/10">
      <div ref={containerRef} style={{ height: 320 }} />
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
