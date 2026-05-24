"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef } from "react";

type MapPlace = {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
};

type EventPlacesMapProps = {
    places: MapPlace[];
};

export function EventPlacesMap({ places }: EventPlacesMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    const placesWithCoordinates = useMemo(
        () =>
            places.filter(
                (place) =>
                    typeof place.latitude === "number" &&
                    typeof place.longitude === "number"
            ),
        [places]
    );

    useEffect(() => {
        const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

        if (!accessToken) return;
        if (!mapContainerRef.current) return;
        if (mapRef.current) return;
        if (placesWithCoordinates.length === 0) return;

        mapboxgl.accessToken = accessToken;

        const firstPlace = placesWithCoordinates[0];

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [
                firstPlace.longitude as number,
                firstPlace.latitude as number,
            ],
            zoom: 12,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        placesWithCoordinates.forEach((place) => {
            const popupContainer = document.createElement("div");
            popupContainer.style.fontFamily = "Arial, sans-serif";

            const title = document.createElement("strong");
            title.textContent = place.name;
            popupContainer.appendChild(title);

            if (place.address) {
                const address = document.createElement("p");
                address.textContent = place.address;
                address.style.margin = "4px 0 0";
                popupContainer.appendChild(address);
            }

            const popup = new mapboxgl.Popup({ offset: 24 }).setDOMContent(
                popupContainer
            );

            new mapboxgl.Marker()
                .setLngLat([
                    place.longitude as number,
                    place.latitude as number,
                ])
                .setPopup(popup)
                .addTo(map);
        });

        if (placesWithCoordinates.length > 1) {
            const bounds = new mapboxgl.LngLatBounds();

            placesWithCoordinates.forEach((place) => {
                bounds.extend([
                    place.longitude as number,
                    place.latitude as number,
                ]);
            });

            map.fitBounds(bounds, {
                padding: 70,
                maxZoom: 14,
            });
        }

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, [placesWithCoordinates]);

    if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                Brakuje NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN w pliku .env.local.
            </div>
        );
    }

    if (placesWithCoordinates.length === 0) {
        return (
            <div className="rounded-2xl border border-white/50 bg-white/40 p-5 text-sm text-slate-600">
                Dodaj miejsce z adresem wybranym z Mapboxa, aby zobaczyć marker na mapie.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-3xl border border-white/40 bg-white/35 shadow-[0_20px_70px_rgba(30,64,175,0.12)] backdrop-blur-2xl">
            <div ref={mapContainerRef} className="h-[360px] w-full" />
        </div>
    );
}