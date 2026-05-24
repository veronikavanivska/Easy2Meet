"use client";

import { useEffect, useMemo, useState } from "react";

type MapboxAddressInputProps = {
    disabled?: boolean;
};

type MapboxFeature = {
    id?: string;
    place_name?: string;
    text?: string;
    center?: number[];
    relevance?: number;
};

type MapboxGeocodingResponse = {
    features?: MapboxFeature[];
};

const inputClassName =
    "w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50";

const suggestionClassName =
    "w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-blue-50 hover:text-blue-800";

const RZESZOW_PROXIMITY = {
    longitude: 22.0047,
    latitude: 50.0412,
};

export function MapboxAddressInput({ disabled = false }: MapboxAddressInputProps) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    const [city, setCity] = useState("Rzeszów");
    const [address, setAddress] = useState("");
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");
    const [mapboxId, setMapboxId] = useState("");
    const [rawSuggestions, setRawSuggestions] = useState<MapboxFeature[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const suggestions = useMemo(() => {
        const trimmedAddress = address.trim();

        if (trimmedAddress.length < 3) {
            return [];
        }

        return rawSuggestions;
    }, [address, rawSuggestions]);

    function clearCoordinates() {
        setLatitude("");
        setLongitude("");
        setMapboxId("");
    }

    useEffect(() => {
        if (!accessToken || disabled) return;

        const trimmedAddress = address.trim();
        const trimmedCity = city.trim();

        if (trimmedAddress.length < 3) return;

        const controller = new AbortController();

        const timeout = window.setTimeout(async () => {
            try {
                setIsLoading(true);

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
                url.searchParams.set(
                    "proximity",
                    `${RZESZOW_PROXIMITY.longitude},${RZESZOW_PROXIMITY.latitude}`
                );

                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    console.error("Mapbox suggestions failed:", response.status);
                    setRawSuggestions([]);
                    return;
                }

                const data = (await response.json()) as MapboxGeocodingResponse;
                const features = data.features ?? [];

                const cityLower = trimmedCity.toLowerCase();

                const sortedFeatures = [...features].sort((a, b) => {
                    const aName = (a.place_name ?? "").toLowerCase();
                    const bName = (b.place_name ?? "").toLowerCase();

                    const aHasCity = cityLower ? aName.includes(cityLower) : false;
                    const bHasCity = cityLower ? bName.includes(cityLower) : false;

                    if (aHasCity !== bHasCity) {
                        return aHasCity ? -1 : 1;
                    }

                    return (b.relevance ?? 0) - (a.relevance ?? 0);
                });

                setRawSuggestions(sortedFeatures);
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") {
                    return;
                }

                console.error("Mapbox suggestions error:", error);
                setRawSuggestions([]);
            } finally {
                setIsLoading(false);
            }
        }, 350);

        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [accessToken, address, city, disabled]);

    function selectSuggestion(feature: MapboxFeature) {
        const center = feature.center;

        setAddress(feature.place_name ?? feature.text ?? address);
        setMapboxId(feature.id ?? "");

        if (Array.isArray(center)) {
            const lng = center[0];
            const lat = center[1];

            setLatitude(String(lat));
            setLongitude(String(lng));
        }

        setRawSuggestions([]);
    }

    return (
        <div className="space-y-3">
            <input
                name="city"
                value={city}
                onChange={(event) => {
                    setCity(event.target.value);
                    clearCoordinates();
                }}
                disabled={disabled}
                placeholder="Miasto, np. Rzeszów"
                className={inputClassName}
            />

            <div className="relative">
                <input
                    name="address"
                    value={address}
                    onChange={(event) => {
                        setAddress(event.target.value);
                        clearCoordinates();
                    }}
                    disabled={disabled}
                    placeholder="Adres lub miejsce, np. Akademicka 3"
                    autoComplete="off"
                    className={inputClassName}
                />

                {!disabled && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-2 rounded-2xl border border-white/60 bg-white p-2 shadow-xl">
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

                {!disabled && isLoading && (
                    <p className="mt-2 text-xs text-slate-500">
                        Szukanie adresu...
                    </p>
                )}
            </div>

            <input type="hidden" name="latitude" value={latitude} />
            <input type="hidden" name="longitude" value={longitude} />
            <input type="hidden" name="mapboxId" value={mapboxId} />

            {address && (!latitude || !longitude) && (
                <p className="text-xs text-amber-700">
                    Wybierz adres z listy sugestii, aby zapisać punkt na mapie.
                </p>
            )}

            {latitude && longitude && (
                <p className="text-xs text-emerald-700">
                    Lokalizacja wybrana: {Number(latitude).toFixed(5)},{" "}
                    {Number(longitude).toFixed(5)}
                </p>
            )}
        </div>
    );
}