'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, LoaderCircle } from 'lucide-react';

type Geolocation = {
  latitude: number;
  longitude: number;
};

interface LocationAddressProps {
  location?: Geolocation;
}

// Function to format the address prioritizing road and house number
const formatAddress = (address: any, displayName: string): string => {
    const { road, house_number, city, town, village, county, country } = address;

    const place = city || town || village || '';
    const province = county ? `(${county.substring(0,2).toUpperCase()})` : '';

    // Prioritize structured address
    if (road) {
        const parts = [road, house_number, place, province].filter(Boolean);
        return parts.join(', ').replace(/, ,/g, ',');
    }

    // Fallback: try to extract from displayName if road is missing
    const displayNameParts = displayName.split(',');
    if (displayNameParts.length > 2) {
        // Assuming the first parts are the most specific (street, number)
        return `${displayNameParts[0].trim()}, ${displayNameParts[1].trim()}, ${place}`;
    }

    // Default fallback if nothing else works
    return displayName;
};


export function LocationAddress({ location }: LocationAddressProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAddress = async () => {
      if (!location) {
        setAddress(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}&addressdetails=1`;

      try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'ServecoApp/1.0' // Required by Nominatim API
            }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data && data.address) {
          const formatted = formatAddress(data.address, data.display_name);
          setAddress(formatted);
        } else {
          setAddress(`Lat: ${location.latitude.toFixed(4)}, Lon: ${location.longitude.toFixed(4)}`);
        }
      } catch (e) {
        console.error("Reverse geocoding failed:", e);
        setError("Indirizzo non disponibile");
        setAddress(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAddress();
  }, [location]);

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <LoaderCircle className="h-3 w-3 animate-spin" />
        <span>Caricamento indirizzo...</span>
      </div>
    );
  }

  if (error) {
     return (
      <div className="inline-flex items-center gap-1 text-destructive text-xs">
        <MapPin className="h-3 w-3" />
        <span>{error}</span>
      </div>
    );
  }

  if (!address) {
    return null;
  }

  return (
    <div className="inline-flex items-start gap-1 text-muted-foreground text-xs">
      <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
      <span className="truncate">{address}</span>
    </div>
  );
}
