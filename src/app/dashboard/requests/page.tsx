"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaveRequests } from "@/components/requests/leave-requests";
import { SupplyRequests } from "@/components/requests/supply-requests";
import { Plane, ShoppingBasket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React from "react";

export default function RequestsPage() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') || 'leave';
    
    return (
      <>
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Richieste</h2>
        </div>
        <Tabs defaultValue={defaultTab} className="w-full space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
                <TabsTrigger value="leave">
                    <Plane className="mr-2 h-4 w-4"/>
                    Richieste Ferie
                </TabsTrigger>
                <TabsTrigger value="supply">
                    <ShoppingBasket className="mr-2 h-4 w-4"/>
                    Richieste Forniture
                </TabsTrigger>
            </TabsList>
            <TabsContent value="leave">
                <LeaveRequests />
            </TabsContent>
            <TabsContent value="supply">
                <SupplyRequests />
            </TabsContent>
        </Tabs>
      </>
    )
}
