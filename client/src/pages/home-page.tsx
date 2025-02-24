import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { VDI } from "@shared/schema";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const { vdis: wsVdis } = useWebSocket();

  // Fetch initial VDI data
  const { data: vdis = [] } = useQuery<(VDI & { assignedUsername?: string })[]>({
    queryKey: ["/api/vdis"],
  });

  // Use WebSocket updates if available, otherwise use query data
  const displayVdis = wsVdis.length > 0 ? wsVdis : vdis;

  const assignMutation = useMutation({
    mutationFn: async (vdiId: string) => {
      const res = await apiRequest("POST", `/api/vdis/${vdiId}/assign`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vdis"] });
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (vdiId: string) => {
      const res = await apiRequest("POST", `/api/vdis/${vdiId}/request`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vdis"] });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold">VDI Dashboard</h1>
          <div className="flex items-center gap-4">
            <span>Welcome, {user?.username}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-center">VDI Status</h2>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>VDI</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayVdis.map((vdi) => (
                <TableRow key={vdi.id}>
                  <TableCell>{vdi.id}</TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-sm ${
                        vdi.status === "Free"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {vdi.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {vdi.assignedUserId === user?.id ? (
                      <span className="text-blue-600 font-medium">You</span>
                    ) : vdi.assignedUserId ? (
                      <span className="text-red-600">{(vdi as any).assignedUsername || 'In Use'}</span>
                    ) : (
                      <span className="text-green-600">Not assigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-x-2">
                      {vdi.status === "Free" && (
                        <Button
                          size="sm"
                          onClick={() => assignMutation.mutate(vdi.id)}
                          disabled={assignMutation.isPending}
                        >
                          Assign VDI
                        </Button>
                      )}
                      {vdi.status === "Assigned" && vdi.assignedUserId !== user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => requestMutation.mutate(vdi.id)}
                          disabled={requestMutation.isPending}
                        >
                          Request VDI
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}