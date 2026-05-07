import { t } from 'elysia';
import {
  PerformanceType,
  MusicGenre,
  Instrument,
  PerformanceLanguage,
} from '../../shared/enums';

/**
 * Geo Point Schema
 */
const GeoPointSchema = t.Object({
  type: t.Literal('Point'),
  coordinates: t.Array(t.Number(), { minItems: 2, maxItems: 2 }), // [lng, lat]
});

/**
 * Location Schema
 */
const LocationSchema = t.Object({
  geoPoint: t.Optional(GeoPointSchema),
  address: t.Optional(t.String()),
  city: t.Optional(t.String()),
  state: t.Optional(t.String()),
  country: t.Optional(t.String()),
  pincode: t.Optional(t.String()),
});

/**
 * Audio Sample Schema
 */
const AudioSampleSchema = t.Object({
  url: t.String(),
  title: t.Optional(t.String()),
  durationSeconds: t.Optional(t.Number()),
  fileSizeBytes: t.Optional(t.Number()),
});

/**
 * Artist Profile Update Schema
 */
const ArtistProfileUpdateSchema = t.Object({
  stageName: t.Optional(t.String({ maxLength: 100 })),
  bio: t.Optional(t.String({ maxLength: 500 })),
  performanceTypes: t.Optional(
    t.Array(t.Enum(PerformanceType))
  ),
  genres: t.Optional(t.Array(t.Enum(MusicGenre))),
  instruments: t.Optional(t.Array(t.Enum(Instrument))),
  languages: t.Optional(t.Array(t.Enum(PerformanceLanguage))),
  audioSamples: t.Optional(t.Array(AudioSampleSchema, { maxItems: 3 })),
  videoLinks: t.Optional(t.Array(t.String(), { maxItems: 5 })),
  portfolioImages: t.Optional(t.Array(t.String(), { maxItems: 5 })),
  yearsOfExperience: t.Optional(t.Number({ minimum: 0, maximum: 50 })),
  notablePerformances: t.Optional(t.String({ maxLength: 500 })),
  preferredCities: t.Optional(t.Array(t.String())),
  baseRate: t.Optional(t.Number({ minimum: 0 })),
  instagramHandle: t.Optional(t.String()),
  youtubeChannel: t.Optional(t.String()),
  whatsappNumber: t.Optional(t.String()),
  location: t.Optional(LocationSchema),
  onboardingComplete: t.Optional(t.Boolean()),
});

/**
 * Client Profile Update Schema
 */
const ClientProfileUpdateSchema = t.Object({
  companyName: t.Optional(t.String()),
  location: t.Optional(LocationSchema),
  industry: t.Optional(t.String()),
});

/**
 * Update User Profile Schema
 */
export const UpdateProfileSchema = t.Object({
  name: t.Optional(t.String()),
  profilePicture: t.Optional(t.String()),
  artistProfile: t.Optional(ArtistProfileUpdateSchema),
  clientProfile: t.Optional(ClientProfileUpdateSchema),
});

/**
 * Search Artists Schema
 */
export const SearchArtistsSchema = t.Object({
  query: t.Optional(t.String()),
  genre: t.Optional(t.Enum(MusicGenre)),
  performanceType: t.Optional(t.Enum(PerformanceType)),
  city: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
  lat: t.Optional(t.Numeric()),
  lng: t.Optional(t.Numeric()),
  distance: t.Optional(t.Numeric({ default: 50000 })), // meters
});
