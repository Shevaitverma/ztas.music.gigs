> ## Status (added 2026-08-04): UNBUILT idea note, and it belongs to the web app, not the admin panel.
>
> Raw shorthand for the event check-in UX. Kept because the flow it sketches is
> still the intended design and nobody has written a better description.
>
> **Where this stands:** the *backend* for exactly this flow is complete —
> `server/src/modules/checkin/` with the `EventCheckIn` model, CSPRNG OTP
> generation, a 5-strike / 15-minute lockout, and dual end-event confirmation.
> `web/lib/api/checkin.ts` is a fully typed client for it. **Nothing calls that
> client.** There is no OTP display for the client, no OTP entry for the artist,
> and no "event in progress" state anywhere in the UI, so the flow below is
> unreachable by any user.
>
> Two corrections to scope:
> - This describes **web app** screens (artist and client), not admin screens.
>   It is filed under `admin/idea/` by accident of history.
> - "show logs" has no backend equivalent. There is no per-event activity feed;
>   `ActivityLog` is admin-facing and records moderation actions, not event
>   timeline entries. That part would need building from scratch.
>
> Endpoints a UI would call: `POST /checkin/generate-otp/:gigId` and
> `GET /checkin/otp/:gigId` (client), `POST /checkin/verify-otp` (artist),
> `POST /checkin/end-event/:gigId` (both), `GET /checkin/status/:gigId`.
> See `server/USER_FLOW_DIAGRAM.md` steps 8–10.

Artist{
  show user is in an active event.
}


flow:{
  artist reachesd ask's for OTP -> client(OTP pop up)-> artist enter the OTP-> events start and show logs.
}
