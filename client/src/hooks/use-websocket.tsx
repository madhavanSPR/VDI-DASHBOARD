import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { VDI, User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

type WebSocketMessage = {
  type: "vdi_update" | "vdi_request";
  data: VDI[] | {
    requestingUser: User;
    vdiId: string;
    requestId: number;
  };
};

export function useWebSocket() {
  const [vdis, setVdis] = useState<VDI[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleVDIRequest = async (requestId: number, approved: boolean) => {
    try {
      await apiRequest(
        "POST",
        `/api/requests/${requestId}/${approved ? 'approve' : 'reject'}`
      );
      queryClient.invalidateQueries({ queryKey: ["/api/vdis"] });
      toast({
        title: `Request ${approved ? 'Approved' : 'Rejected'}`,
        description: `VDI request has been ${approved ? 'approved' : 'rejected'}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process VDI request.",
        variant: "destructive",
      });
    }
  };

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as WebSocketMessage;

      if (message.type === "vdi_update") {
        setVdis(message.data as VDI[]);
        toast({
          title: "VDI Status Updated",
          description: "The VDI status has been updated.",
        });
      } else if (message.type === "vdi_request") {
        const requestData = message.data as { requestingUser: User; vdiId: string; requestId: number };
        toast({
          title: "New VDI Request",
          description: (
            <div className="space-y-2">
              <p>User {requestData.requestingUser.username} has requested VDI {requestData.vdiId}</p>
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  onClick={() => handleVDIRequest(requestData.requestId, true)}
                >
                  Accept
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleVDIRequest(requestData.requestId, false)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ),
          duration: 10000, // Show for 10 seconds
        });
      }
    };

    socket.onerror = () => {
      toast({
        title: "WebSocket Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    };

    return socket;
  }, [toast, user]);

  useEffect(() => {
    const socket = connect();
    return () => socket.close();
  }, [connect]);

  return { vdis };
}