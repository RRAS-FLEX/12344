export type BoatServiceType = "all" | "rental" | "party" | "watersports";

export interface BoatSearchCriteria {
  location: string;
  dateTime: string;
  passengers: number;
  serviceType?: BoatServiceType;
}