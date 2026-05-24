"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

type MapboxPlacePickerProps = {
    disabled?: boolean;
};

type MapboxContextItem = {
    id?: string;
    text?: string;
    short_code?: string;
};

type MapboxFeature = {
    id?: string;
    place_name?: string;
    text?: string;
    center?: number[];
    bbox?: number[];
    context?: MapboxContextItem[];
};

type MapboxGeocodingResponse = {
    features?: MapboxFeature[];
};

type CityViewport = {
    center: [number, number];
    bbox?: [number, number, number, number];
};

const DEFAULT_CENTER: [number, number] = [19.1451, 51.9194];

const inputClassName =
    "w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50";

const suggestionClassName =
    "w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-800";

function getFeatureCoordinates(feature: MapboxFeature): [number, number] | null {
    const center = feature.center;

    if (!Array.isArray(center)) return null;

    const lng = center[0];
    const lat = center[1];

    if (typeof lng !== "number" || typeof lat !== "number") return null;

    return [lng, lat];
}

function getFeatureCountryCode(feature: MapboxFeature) {
    const country = feature.context?.find((item) => item.id?.startsWith("country."));

    return country?.short_code?.toUpperCase() ?? "";
}

async function reverseGeocode(
    accessToken: string,
    longitude: number,
    latitude: number
) {
    const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`
    );

    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("language", "pl,en");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error(`Mapbox reverse geocoding failed: ${response.status}`);
    }

    const data = (await response.json()) as MapboxGeocodingResponse;
    return data.features?.[0] ?? null;
}

export function MapboxPlacePicker({ disabled = false }: MapboxPlacePickerProps) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);

    const [city, setCity] = useState("");
    const [address, setAddress] = useState("");
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");
    const [mapboxId, setMapboxId] = useState("");
    const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
    const [cityViewport, setCityViewport] = useState<CityViewport | null>(null);
    const [isLoadingCity, setIsLoadingCity] = useState(false);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

    const hasSelectedLocation = latitude !== "" && longitude !== "";

    const selectedCoordinates = useMemo<[number, number] | null>(() => {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        return [lng, lat];
    }, [latitude, longitude]);

    function clearSelectedLocation() {
        setLatitude("");
        setLongitude("");
        setMapboxId("");

        if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
        }
    }

    function setSelectedLocation(params: {
        address: string;
        latitude: number;
        longitude: number;
        mapboxId?: string;
        fly?: boolean;
    }) {
        setAddress(params.address);
        setLatitude(String(params.latitude));
        setLongitude(String(params.longitude));
        setMapboxId(params.mapboxId ?? "");
        setSuggestions([]);

        if (!mapRef.current) return;

        const lngLat: [number, number] = [params.longitude, params.latitude];

        if (!markerRef.current) {
            markerRef.current = new mapboxgl.Marker().setLngLat(lngLat).addTo(mapRef.current);
        } else {
            markerRef.current.setLngLat(lngLat);
        }

        if (params.fly !== false) {
            mapRef.current.flyTo({
                center: lngLat,
                zoom: 14,
            });
        }
    }

    useEffect(() => {
        if (!accessToken || disabled) return;
        if (!mapContainerRef.current) return;
        if (mapRef.current) return;

        mapboxgl.accessToken = accessToken;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: DEFAULT_CENTER,
            zoom: 4,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("click", async (event) => {
            if (disabled || !accessToken) return;

            const lng = event.lngLat.lng;
            const lat = event.lngLat.lat;

            try {
                const feature = await reverseGeocode(accessToken, lng, lat);

                setSelectedLocation({
                    address: feature?.place_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                    latitude: lat,
                    longitude: lng,
                    mapboxId: feature?.id,
                    fly: false,
                });
            } catch (error) {
                console.error(error);

                setSelectedLocation({
                    address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                    latitude: lat,
                    longitude: lng,
                    fly: false,
                });
            }
        });

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
    }, [accessToken, disabled]);

    useEffect(() => {
        if (!accessToken || disabled) return;

        const trimmedCity = city.trim();

        if (trimmedCity.length < 2) {
            setCityViewport(null);
            return;
        }

        const controller = new AbortController();

        const timeout = window.setTimeout(async () => {
            try {
                setIsLoadingCity(true);

                const url = new URL(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                        trimmedCity
                    )}.json`
                );

                url.searchParams.set("access_token", accessToken);
                url.searchParams.set("language", "pl,en");
                url.searchParams.set("types", "place,locality,district,region");
                url.searchParams.set("limit", "1");

                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    setCityViewport(null);
                    return;
                }

                const data = (await response.json()) as MapboxGeocodingResponse;
                const feature = data.features?.[0];

                const coordinates = feature ? getFeatureCoordinates(feature) : null;

                if (!coordinates) {
                    setCityViewport(null);
                    return;
                }

                const bbox =
                    Array.isArray(feature?.bbox) && feature.bbox.length >= 4
                        ? ([
                            feature.bbox[0],
                            feature.bbox[1],
                            feature.bbox[2],
                            feature.bbox[3],
                        ] as [number, number, number, number])
                        : undefined;

                setCityViewport({
                    center: coordinates,
                    bbox,
                });

                if (mapRef.current) {
                    if (bbox) {
                        mapRef.current.fitBounds(
                            [
                                [bbox[0], bbox[1]],
                                [bbox[2], bbox[3]],
                            ],
                            {
                                padding: 70,
                                maxZoom: 12,
                            }
                        );
                    } else {
                        mapRef.current.flyTo({
                            center: coordinates,
                            zoom: 11,
                        });
                    }
                }
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") return;

                console.error(error);
                setCityViewport(null);
            } finally {
                setIsLoadingCity(false);
            }
        }, 350);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [accessToken, city, disabled]);

    useEffect(() => {
        if (!accessToken || disabled) return;

        const trimmedAddress = address.trim();

        if (trimmedAddress.length < 3) {
            setSuggestions([]);
            return;
        }

        if (hasSelectedLocation) return;

        const controller = new AbortController();

        const timeout = window.setTimeout(async () => {
            try {
                setIsLoadingSuggestions(true);

                const query = city.trim()
                    ? `${trimmedAddress}, ${city.trim()}`
                    : trimmedAddress;

                const url = new URL(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                        query
                    )}.json`
                );

                url.searchParams.set("access_token", accessToken);
                url.searchParams.set("language", "pl,en");
                url.searchParams.set("limit", "8");
                url.searchParams.set("types", "address,poi,place,locality");

                if (cityViewport?.center) {
                    url.searchParams.set(
                        "proximity",
                        `${cityViewport.center[0]},${cityViewport.center[1]}`
                    );
                }

                if (cityViewport?.bbox) {
                    url.searchParams.set("bbox", cityViewport.bbox.join(","));
                }

                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    setSuggestions([]);
                    return;
                }

                const data = (await response.json()) as MapboxGeocodingResponse;
                const features = data.features ?? [];

                const filteredFeatures = features.filter((feature) => {
                    const coordinates = getFeatureCoordinates(feature);

                    if (!coordinates) return false;

                    return Boolean(feature.place_name || feature.text);
                });

                setSuggestions(filteredFeatures);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") return;

                console.error(error);
                setSuggestions([]);
            } finally {
                setIsLoadingSuggestions(false);
            }
        }, 350);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [accessToken, address, city, cityViewport, disabled, hasSelectedLocation]);

    function selectSuggestion(feature: MapboxFeature) {
        const coordinates = getFeatureCoordinates(feature);

        if (!coordinates) return;

        const [lng, lat] = coordinates;
        const countryCode = getFeatureCountryCode(feature);
        const suffix = countryCode ? ` (${countryCode})` : "";

        setSelectedLocation({
            address: feature.place_name ?? feature.text ?? address,
            latitude: lat,
            longitude: lng,
            mapboxId: feature.id,
        });

        if (feature.place_name && countryCode && !feature.place_name.includes(countryCode)) {
            console.info(`Selected Mapbox place${suffix}`);
        }
    }

    return (
        <div className="space-y-3">
            <input
                name="city"
                value={city}
                onChange={(event) => {
                    setCity(event.target.value);
                    clearSelectedLocation();
                }}
                disabled={disabled}
                placeholder="Miasto opcjonalnie, np. Rzeszów, Berlin, London"
                autoComplete="off"
                className={inputClassName}
            />

            <div className="relative">
                <input
                    name="address"
                    value={address}
                    onChange={(event) => {
                        setAddress(event.target.value);
                        clearSelectedLocation();
                    }}
                    disabled={disabled}
                    placeholder="Adres lub miejsce, np. Akademicka 3, Alexanderplatz"
                    autoComplete="off"
                    className={inputClassName}
                />

                {!disabled && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/60 bg-white p-2 shadow-xl">
                        {suggestions.map((feature) => (
                            <button
                                key={feature.id ?? feature.place_name ?? feature.text}
                                type="button"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    selectSuggestion(feature);
                                }}
                                className={suggestionClassName}
                            >
                                {feature.place_name ?? feature.text}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/40">
                <div ref={mapContainerRef} className="h-72 w-full" />
            </div>

            <input type="hidden" name="address" value={address} />
            <input type="hidden" name="latitude" value={latitude} />
            <input type="hidden" name="longitude" value={longitude} />
            <input type="hidden" name="mapboxId" value={mapboxId} />

            <div className="space-y-1 text-xs">
                {isLoadingCity && (
                    <p className="text-slate-500">Szukam miasta...</p>
                )}

                {isLoadingSuggestions && (
                    <p className="text-slate-500">Szukam adresów...</p>
                )}

                {address && !hasSelectedLocation && (
                    <p className="text-amber-700">
                        Wybierz adres z listy albo kliknij punkt na mapie.
                    </p>
                )}

                {hasSelectedLocation && selectedCoordinates && (
                    <p className="text-emerald-700">
                        Lokalizacja wybrana: {Number(latitude).toFixed(5)},{" "}
                        {Number(longitude).toFixed(5)}
                    </p>
                )}
            </div>
        </div>
    );
}