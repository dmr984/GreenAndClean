"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import ShiftApprovalPage from "../shift-approval/page";
import ExtraShiftApprovalPage from "../extra-shifts/page";
import CancelClockingPage from "./_components/cancel-clocking-tab";

type View = "approval" | "extra" | "cancel";

export default function ClockingsPage() {
  const [activeView, setActiveView] = React.useState<View>("approval");

  const renderView = () => {
    switch (activeView) {
      case "approval":
        return <ShiftApprovalPage />;
      case "extra":
        return <ExtraShiftApprovalPage />;
      case "cancel":
        return <CancelClockingPage />;
      default:
        return <ShiftApprovalPage />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Timbrature</h2>
      </div>
      
      <div className="grid w-full grid-cols-1 sm:grid-cols-3 gap-2">
          <Button 
            variant={activeView === 'approval' ? 'default' : 'outline'}
            onClick={() => setActiveView('approval')}
          >
            Approvazione Timbrature
          </Button>
          <Button 
            variant={activeView === 'extra' ? 'default' : 'outline'}
            onClick={() => setActiveView('extra')}
          >
            Timbrature Extra
          </Button>
          <Button 
            variant={activeView === 'cancel' ? 'default' : 'outline'}
            onClick={() => setActiveView('cancel')}
          >
            Annulla Timbrature
          </Button>
      </div>

      <div>
        {renderView()}
      </div>
    </div>
  );
}
