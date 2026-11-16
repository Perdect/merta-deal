"use client";
import * as React from "react";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { AddressWizard } from "@/components/shop/address-wizard";

/** Mirrors how AddressSheet / checkout host the wizard: one screen header whose title and back
 *  arrow follow the step. Saving is not part of the preview (it would need a session). */
export function LocationPreview() {
  const [open, setOpen] = React.useState(true);
  const [mapStep, setMapStep] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (!open) setMapStep(false); }
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open the address wizard</Button>
      <Modal open={open} onClose={() => (mapStep ? setMapStep(false) : setOpen(false))} title={mapStep ? "Select Your Location" : "Location information"} size="screen">
        <AddressWizard mapOpen={mapStep} onMapOpenChange={setMapStep} defaultName="Rehan" defaultPhone="8875020202" onCancel={() => setOpen(false)} onSaved={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
