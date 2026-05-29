import { ChevronLeft, ChevronRight, Heart, MapPin, Star, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import { buildBoatDetailsPath } from "@/lib/boats";
import type { BoatOwner } from "@/lib/boats";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface BoatCardProps {
  id?: string;
  image: string;
  images?: string[];
  name: string;
  type?: string;
  capacity: number;
  location: string;
  pricePerDay: number;
  ticketMaxPeople?: number;
  ticketPricePerPerson?: number;
  rating: number;
  index: number;
  reviewCount?: number;
  favoriteCount?: number;
  owner?: BoatOwner;
  partyReady?: boolean;
}

const formatEuroAmount = (value: number) => `€${value.toFixed(value % 1 === 0 ? 0 : 2)}`;

const BoatCard = ({
  id,
  image,
  images,
  name,
  type,
  capacity,
  location,
  pricePerDay,
  ticketMaxPeople,
  ticketPricePerPerson,
  rating,
  index,
  reviewCount,
  favoriteCount,
  owner,
  partyReady,
}: BoatCardProps) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = id ? isFavorite(id) : false;
  const galleryImages = useMemo(() => {
    const candidates = [
      ...(Array.isArray(images) ? images : []),
      image,
    ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);

    return Array.from(new Set(candidates));
  }, [images, image]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [id, image, images]);

  const hasGalleryControls = galleryImages.length > 1;
  const displayedImage = galleryImages[activeImageIndex] ?? image;
  const resolvedTicketMaxPeople = ticketMaxPeople && ticketMaxPeople > 0 ? ticketMaxPeople : capacity;
  const resolvedTicketPricePerPerson =
    Number.isFinite(ticketPricePerPerson) && (ticketPricePerPerson ?? 0) > 0
      ? ticketPricePerPerson
      : partyReady && capacity > 0
        ? pricePerDay / capacity
        : 0;
  const partyTicketSummary =
    partyReady && resolvedTicketMaxPeople > 0 && resolvedTicketPricePerPerson > 0
      ? `${formatEuroAmount(resolvedTicketPricePerPerson)} / ${resolvedTicketMaxPeople} people`
      : null;
  const primaryPriceLabel = partyReady && resolvedTicketPricePerPerson > 0
    ? `${formatEuroAmount(resolvedTicketPricePerPerson)} / ticket`
    : `€${pricePerDay}`;
  const secondaryPriceLabel = partyReady && resolvedTicketMaxPeople > 0
    ? `up to ${resolvedTicketMaxPeople} guests`
    : "starting";

  const showPreviousImage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex((current) =>
      current === 0 ? galleryImages.length - 1 : current - 1,
    );
  };

  const showNextImage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex((current) =>
      current === galleryImages.length - 1 ? 0 : current + 1,
    );
  };

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="group bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 cursor-pointer"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={displayedImage}
          alt={name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {hasGalleryControls ? (
          <>
            <button
              type="button"
              aria-label="Show previous image"
              onClick={showPreviousImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-card/90 backdrop-blur-sm p-1.5 transition-colors hover:bg-card"
            >
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </button>
            <button
              type="button"
              aria-label="Show next image"
              onClick={showNextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-card/90 backdrop-blur-sm p-1.5 transition-colors hover:bg-card"
            >
              <ChevronRight className="h-4 w-4 text-foreground" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
              {activeImageIndex + 1}/{galleryImages.length}
            </div>
          </>
        ) : null}
        <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
          <span className="text-lg font-heading font-bold text-foreground">{primaryPriceLabel}</span>
          <span className="text-sm text-muted-foreground"> {secondaryPriceLabel}</span>
        </div>
        {id && (
          <button
            type="button"
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleFavorite(id);
            }}
            className="absolute top-3 left-3 rounded-full bg-card/90 backdrop-blur-sm p-1.5 transition-colors hover:bg-card"
          >
            <Heart
              className={`h-4 w-4 transition-colors ${
                favorited ? "fill-rose-500 text-rose-500" : "text-muted-foreground"
              }`}
            />
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-foreground text-lg mb-1">{name}</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {type ? <span className="text-[11px] rounded-full bg-aegean/10 px-2.5 py-1 text-aegean">{type}</span> : null}
            {partyReady ? (
              <span className="text-[11px] rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                {partyTicketSummary ?? "Party ready"}
              </span>
            ) : null}
            {/* Voucher feature removed */}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {location}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {capacity} guests
            </span>
            {typeof favoriteCount === "number" ? (
              <span className="flex items-center gap-1 text-xs">
                <Heart className="h-3.5 w-3.5" />
                {favoriteCount}
              </span>
            ) : null}
            {typeof reviewCount === "number" ? (
              <span className="text-xs">{reviewCount} reviews</span>
            ) : null}
          </div>
        </div>
        
        {owner && owner.name ? (
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <Avatar className="h-10 w-10 border border-border flex-shrink-0">
              <AvatarFallback className="bg-aegean/10 text-aegean text-xs font-semibold">
                {(owner.name || "Owner")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{owner.name}</p>
              <p className="text-xs text-muted-foreground truncate">{owner.title || "Boat Owner"}</p>
            </div>
          </div>
        ) : null}
        
        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="text-lg font-heading font-bold text-foreground">{primaryPriceLabel}</span>
            <span className="text-sm text-muted-foreground"> {partyReady ? "ticket" : "/ day"}</span>
            {partyTicketSummary ? (
              <p className="text-xs text-muted-foreground mt-1">Tickets {partyTicketSummary}</p>
            ) : null}
          </div>
          {id ? (
            <Link to={buildBoatDetailsPath({ id, name, location })} className="text-sm font-medium text-aegean hover:text-turquoise transition-colors">
              View Boat →
            </Link>
          ) : (
            <button className="text-sm font-medium text-aegean hover:text-turquoise transition-colors">
              View Boat →
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );

  if (!id) {
    return cardContent;
  }

  return (
    <Link to={buildBoatDetailsPath({ id, name, location })} aria-label={`View ${name} boat details`} className="block">
      {cardContent}
    </Link>
  );
};

export default BoatCard;
