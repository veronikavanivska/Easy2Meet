"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";

type MapboxPlacePickerProps = {
    disabled?: boolean;
};

type MapboxFeature = {
    id?: string;
    place_name?: string;
    text?: string;
    center?: number[];
    bbox?: number[];
    relevance?: number;
};

type MapboxGeocodingResponse = {
    features?: MapboxFeature[];
};

type Coordinates = {
    latitude: string;
    longitude: string;
};

const POLAND_CENTER: [number, number] = [19.1451, 51.9194];

const inputClassName =
    "w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50";

const suggestionClassName =
    "w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-800";

function getNumberPair(value: number[] | undefined): [number, number] | null {
    if (!Array.isArray(value)) return null;

    const longitude = value[0];
    const latitude = value[1];

    if (typeof longitude !== "number" || typeof latitude !== "number") {
        return null;
    }

    return [longitude, latitude];
}

function getBbox(value: number[] | undefined): [number, number, number, number] | null {
    if (!Array.isArray(value) || value.length < 4) return null;

    const [minLng, minLat, maxLng, maxLat] = value;

    if (
        typeof minLng !== "number" ||
        typeof minLat !== "number" ||
        typeof maxLng !== "number" ||
        typeof maxLat !== "number"
    ) {
        return null;
    }

    return [minLng, minLat, maxLng, maxLat];
}

export function MapboxPlacePicker({ disabled = false }: MapboxPlacePickerProps) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markerRef = useRef<mapboxgl.Marker | null>(null);

    const [city, setCity] = useState("");
    const [address, setAddress] = useState("");
    const [coordinates, setCoordinates] = useState<Coordinates>({
        latitude: "",
        longitude: "",
    });
    const [mapboxId, setMapboxId] = useState("");
    const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
    const [cityCenter, setCityCenter] = useState<[number, number] | null>(null);
    const [cityBbox, setCityBbox] = useState<[number, number, number, number] | null>(null);
    const [isCityLoading, setIsCityLoading] = useState(false);
    const [isAddressLoading, setIsAddressLoading] = useState(false);

    const selectedLongitude = coordinates.longitude ? Number(coordinates.longitude) : null;
    const selectedLatitude = coordinates.latitude ? Number(coordinates.latitude) : null;

    const hasSelectedCoordinates =
        typeof selectedLongitude === "number" &&
        typeof selectedLatitude === "number" &&
        !Number.isNaN(selectedLongitude) &&
        !Number.isNaN(selectedLatitude);

    const mapCenter = useMemo<[number, number]>(() => {
        if (hasSelectedCoordinates) {
            return [selectedLongitude, selectedLatitude];
        }

        return cityCenter ?? POLAND_CENTER;
    }, [cityCenter, hasSelectedCoordinates, selectedLatitude, selectedLongitude]);

    function clearCoordinates() {
        setCoordinates({
            latitude: "",
            longitude: "",
        });
        setMapboxId("");
    }

    function setSelectedPlace(input: {
        address: string;
        longitude: number;
        latitude: number;
        mapboxId?: string;
    }) {
        setAddress(input.address);
        setCoordinates({
            latitude: String(input.latitude),
            longitude: String(input.longitude),
        });
        setMapboxId(input.mapboxId ?? "");
        setSuggestions([]);
    }

    useEffect(() => {
        if (!accessToken || disabled) return;

        const trimmedCity = city.trim();

        if (trimmedCity.length < 2) {
            setCityCenter(null);
            setCityBbox(null);
            return;
        }

        const controller = new AbortController();

        const timeout = window.setTimeout(async () => {
            try {
                setIsCityLoading(true);

                const url = new URL(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                        `${trimmedCity}, Polska`
                    )}.json`
                );

                url.searchParams.set("access_token", accessToken);
                url.searchParams.set("country", "pl");
                url.searchParams.set("language", "pl");
                url.searchParams.set("limit", "1");
                url.searchParams.set("types", "place,locality,district,region,postcode");

                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    setCityCenter(null);
                    setCityBbox(null);
                    return;
                }

                const data = (await response.json()) as MapboxGeocodingResponse;
                const feature = data.features?.[0];

                const center = getNumberPair(feature?.center);
                const bbox = getBbox(feature?.bbox);

                setCityCenter(center);
                setCityBbox(bbox);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }

                console.error("Mapbox city lookup error:", error);
                setCityCenter(null);
                setCityBbox(null);
            } finally {
                setIsCityLoading(false);
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
        const trimmedCity = city.trim();

        if (trimmedAddress.length < 3) return;

        const controller = new AbortController();

        const timeout = window.setTimeout(async () => {
            try {
                setIsAddressLoading(true);

                const query = trimmedCity
                    ? `${trimmedAddress}, ${trimmedCity}, Polska`
                    : `${trimmedAddress}, Polska`;

                const url = new URL(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                        query
                    )}.json`
                );

                url.searchParams.set("access_token", accessToken);
                url.searchParams.set("country", "pl");
                url.searchParams.set("language", "pl");
                url.searchParams.set("limit", "8");
                url.searchParams.set("types", "address,poi");

                if (cityBbox) {
                    url.searchParams.set("bbox", cityBbox.join(","));
                }

                if (cityCenter) {
                    url.searchParams.set("proximity", `${cityCenter[0]},${cityCenter[1]}`);
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

                const sortedFeatures = [...features].sort((a, b) => {
                    const cityLower = trimmedCity.toLowerCase();
                    const aName = (a.place_name ?? "").toLowerCase();
                    const bName = (b.place_name ?? "").toLowerCase();

                    const aHasCity = cityLower ? aName.includes(cityLower) : false;
                    const bHasCity = cityLower ? bName.includes(cityLower) : false;

                    if (aHasCity !== bHasCity) {
                        return aHasCity ? -1 : 1;
                    }

                    return (b.relevance ?? 0) - (a.relevance ?? 0);
                });

                setSuggestions(sortedFeatures);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }

                console.error("Mapbox address lookup error:", error);
                setSuggestions([]);
            } finally {
                setIsAddressLoading(false);
            }
        }, 350);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [accessToken, address, city, cityBbox, cityCenter, disabled]);

    useEffect(() => {
        if (!accessToken || !mapContainerRef.current || mapRef.current) return;

        mapboxgl.accessToken = accessToken;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: mapCenter,
            zoom: cityCenter ? 11 : 5,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("click", async (event) => {
            if (disabled) return;

            const longitude = event.lngLat.lng;
            const latitude = event.lngLat.lat;

            setCoordinates({
                latitude: String(latitude),
                longitude: String(longitude),
            });
            setMapboxId("");

            try {
                const url = new URL(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`
                );

                url.searchParams.set("access_token", accessToken);
                url.searchParams.set("country", "pl");
                url.searchParams.set("language", "pl");
                url.searchParams.set("limit", "1");

                const response = await fetch(url.toString());

                if (!response.ok) return;

                const data = (await response.json()) as MapboxGeocodingResponse;
                const feature = data.features?.[0];

                if (feature?.place_name) {
                    setAddress(feature.place_name);
                }

                if (feature?.id) {
                    setMapboxId(feature.id);
                }
            } catch (error) {
                console.error("Mapbox reverse geocoding error:", error);
            }
        });

        mapRef.current = map;

        return () => {
            markerRef.current?.remove();
            markerRef.current = null;
            map.remove();
            mapRef.current = null;
        };
        // map must be initialized once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken, disabled]);

    useEffect(() => {
        const map = mapRef.current;

        if (!map) return;

        map.easeTo({
            center: mapCenter,
            zoom: hasSelectedCoordinates ? 15 : cityCenter ? 11 : 5,
            duration: 600,
        });
    }, [cityCenter, hasSelectedCoordinates, mapCenter]);

    useEffect(() => {
        const map = mapRef.current;

        if (!map || !hasSelectedCoordinates) return;

        const lngLat: [number, number] = [selectedLongitude, selectedLatitude];

        if (!markerRef.current) {
            markerRef.current = new mapboxgl.Marker({
                draggable: !disabled,
            })
                .setLngLat(lngLat)
                .addTo(map);

            markerRef.current.on("dragend", () => {
                const markerLngLat = markerRef.current?.getLngLat();

                if (!markerLngLat) return;

                setCoordinates({
                    latitude: String(markerLngLat.lat),
                    longitude: String(markerLngLat.lng),
                });
            });

            return;
        }

        markerRef.current.setLngLat(lngLat);
    }, [disabled, hasSelectedCoordinates, selectedLatitude, selectedLongitude]);

    function selectSuggestion(feature: MapboxFeature) {
        const center = getNumberPair(feature.center);

        if (!center) return;

        setSelectedPlace({
            address: feature.place_name ?? feature.text ?? address,
            longitude: center[0],
            latitude: center[1],
            mapboxId: feature.id,
        });
    }

    if (!accessToken) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Brakuje NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.
                <input type="hidden" name="address" value={address} />
                <input type="hidden" name="latitude" value="" />
                <input type="hidden" name="longitude" value="" />
                <input type="hidden" name="mapboxId" value="" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <input
                name="city"
                value={city}
                onChange={(event) => {
                    setCity(event.target.value);
                    setSuggestions([]);
                    clearCoordinates();
                }}
                disabled={disabled}
                placeholder="Miasto opcjonalnie, np. Kraków"
                className={inputClassName}
            />

            <div className="relative">
                <input
                    name="address"
                    value={address}
                    onChange={(event) => {
                        setAddress(event.target.value);
                        setSuggestions([]);
                        clearCoordinates();
                    }}
                    disabled={disabled}
                    placeholder="Adres lub miejsce, np. Rynek 1"
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

                {!disabled && (isAddressLoading || isCityLoading) && (
                    <p className="mt-2 text-xs text-slate-500">
                        Szukanie lokalizacji...
                    </p>
                )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/50">
                <div ref={mapContainerRef} className="h-[280px] w-full" />
            </div>

            <input type="hidden" name="latitude" value={coordinates.latitude} />
            <input type="hidden" name="longitude" value={coordinates.longitude} />
            <input type="hidden" name="mapboxId" value={mapboxId} />

            {address && (!coordinates.latitude || !coordinates.longitude) && (
                <p className="text-xs text-amber-700">
                    Wybierz sugestię z listy albo kliknij punkt na mapie, aby zapisać współrzędne.
                </p>
            )}

            {coordinates.latitude && coordinates.longitude && (
                <p className="text-xs text-emerald-700">
                    Lokalizacja wybrana: {Number(coordinates.latitude).toFixed(5)},{" "}
                    {Number(coordinates.longitude).toFixed(5)}
                </p>
            )}
        </div>
    );
}
