export type TokenLabel =
  | 'PRODUCT'
  | 'VEHICLE_FAMILY'
  | 'VEHICLE_VARIANT'
  | 'BRAND'
  | 'ENGINE'
  | 'GEARBOX'
  | 'UNIT'
  | 'COLOR'
  | 'SIDE'
  | 'POSITION'
  | 'CONDITION'
  | 'ACTION'
  | 'LOCATION'
  | 'PACKAGING'
  | 'NUMBER'
  | 'YEAR'
  | 'UNKNOWN';



export interface DictionaryEntry {
  key: string;
  normalizedKey: string;
  category: string;
  metadata?: Record<string, any>;
}



export interface ClassifiedToken {
  raw: string;
  normalized: string;
  label: TokenLabel;
  entry?: any;
  score: number;
  consumed: boolean;
}



export interface DomainDictionaryConfig {

  products: Array<{
    name: string;
    category: string;
    aliases: string[];
    validVehicles?: string[];
    validEngines?: string[];
  }>;


  vehicles: Array<{
    family: string;
    variant: string;
    engine: string;
    gearbox: string;
    aliases: string[];
  }>;


  brands: Record<string,string>;

  engines: Record<string,string>;

  gearboxes: Record<string,string>;

  units: Record<string,string>;

  colors: Record<string,string>;

  sides: Record<string,string>;

  positions: Record<string,string>;

  conditions: Record<string,string>;

  actions: Record<string,string>;

  locations: Record<string,string>;

  packaging: Record<string,string>;

  speechErrors: Record<string,string>;

}





export interface ParseExplanation {


  // Pipeline Debug

  tokens?: string[];

  normalized?: string;

  correctedTokens?: string[];

  numbers?: any[];

  numberResults?: any[];


  matched?: any;

  classified?: any;

  validation?: any;

  context?: any;

  confidenceResult?: any;



  // Matched Data

  matchedProduct?: string | null;

  matchedVehicleFamily?: string | null;

  matchedVehicleVariant?: string | null;

  matchedBrand?: string | null;

  matchedEngine?: string | null;

  matchedGearbox?: string | null;

  matchedPosition?: string | null;

  matchedSide?: string | null;

  matchedCondition?: string | null;



  matchedQuantity?: number | null;



  // Quantity

  goodQuantity: number;

  badQuantity: number;



  year?: number | null;



  // Validation

  unknownTokens: string[];

  validationStatus:
    | 'Passed'
    | 'Failed'
    | 'Warning';


  validationMessages: string[];



  // Confidence

  confidence: number;



  // Details

  matchedDetails: Record<string,string|null>;

}





export interface ParseResult {

  success: boolean;


  data: {

    productName: string | null;

    productCategory: string | null;

    brand: string | null;

    vehicleFamily: string | null;

    // فقط اگر کارگر مدل را صریح گفته باشد؛ در غیر این صورت null (هرگز حدس زده نمی‌شود)
    vehicleModel: string | null;

    vehicleVariant: string | null;

    engine: string | null;

    gearbox: string | null;

    position: string | null;

    side: string | null;

    condition: string | null;

    year: number | null;

    quantity: number | null;

    goodQuantity: number;

    badQuantity: number;

  };


  explanation: ParseExplanation;


  rawInput: string;


  processingTimeMs: number;

}