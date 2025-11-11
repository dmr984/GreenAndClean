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
                'User-Agent': 'ServecoApp/1.0'
            }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data && data.address) {
            const { road, house_number, town, village, city, county } = data.address;
            const street = road || '';
            const number = house_number || '';
            const place = city || town || village || '';
            const province = county ? `(${county.substring(0,2).toUpperCase()})` : '';

            const formattedAddress = [street, number, place, province].filter(Boolean).join(', ').replace(' ,', ',');
            
            if (formattedAddress) {
                 setAddress(formattedAddress);
            } else {
                 setAddress(data.display_name);
            }
          
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
