"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ShiftApprovalPage from "../shift-approval/page";
import ExtraShiftApprovalPage from "../extra-shifts/page";
import CancelClockingPage from "./_components/cancel-clocking-tab";

export default function ClockingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestione Timbrature</h2>
      </div>
      <Tabs defaultValue="approval">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="approval">Approvazione Timbrature</TabsTrigger>
          <TabsTrigger value="extra">Timbrature Extra</TabsTrigger>
          <TabsTrigger value="cancel">Annulla Timbrature</TabsTrigger>
        </TabsList>
        <TabsContent value="approval">
          <ShiftApprovalPage />
        </TabsContent>
        <TabsContent value="extra">
          <ExtraShiftApprovalPage />
        </TabsContent>
        <TabsContent value="cancel">
          <CancelClockingPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
