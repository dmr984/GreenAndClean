import { ClockWidget } from "@/components/dashboard/clock-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, CheckCircle } from "lucide-react";

const announcements = [
  {
    title: "New Cleaning Protocol for Zone C",
    date: "2 days ago",
    content: "Please be advised of the new cleaning protocols for all areas in Zone C, effective immediately. A brief training session will be held tomorrow at 8 AM."
  },
  {
    title: "Holiday Schedule Update",
    date: "5 days ago",
    content: "The holiday schedule for the upcoming month has been posted. Please check your assigned shifts and report any conflicts by the end of the week."
  },
  {
    title: "Supply Restock Complete",
    date: "1 week ago",
    content: "The supply closet has been restocked with all standard cleaning materials. Please update your inventory accordingly."
  },
];

export default function Dashboard() {
  return (
    <>
    <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
    <div className="grid gap-4 md:gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
         <ClockWidget />
      </div>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Announcements</CardTitle>
          </div>
          <CardDescription>
            Important updates and notices from the administration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-6">
            {announcements.map((ann, index) => (
              <li key={index} className="flex items-start gap-4">
                <div className="p-1 rounded-full bg-secondary mt-1">
                  <CheckCircle className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div className="grid gap-1">
                  <p className="text-base font-medium leading-none">
                    {ann.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ann.content}
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">{ann.date}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
