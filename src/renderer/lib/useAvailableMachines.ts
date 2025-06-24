import { useState, useEffect } from 'react';
import { useAPI, getFullPath } from 'renderer/lib/transformerlab-api-sdk';

interface Machine {
  id: number;
  name: string;
  host: string;
  port: number;
  is_reserved: boolean;
  reserved_by_host?: string;
}

interface ReservationInfo {
  isReservedByMe: boolean;
  isReservedByOther: boolean;
  reservedBy?: string;
}

/**
 * Get reservation information for a specific machine
 */
async function getMachineReservationInfo(
  machineId: number,
): Promise<ReservationInfo> {
  try {
    // Get machine details including reservation status
    const response = await fetch(
      getFullPath('network', ['getMachine'], { machineId }),
    );

    if (!response.ok) {
      console.log(`Failed to get machine ${machineId} details`);
      return { isReservedByMe: false, isReservedByOther: false };
    }

    const machineData = await response.json();
    const machine = machineData.data;

    console.log(`Machine ${machineId} data:`, machine);

    if (!machine.is_reserved || !machine.reserved_by_host) {
      console.log(`Machine ${machineId} is not reserved`);
      return { isReservedByMe: false, isReservedByOther: false };
    }

    // Get current user's host identifier
    const myReservationsResponse = await fetch(
      getFullPath('network', ['getMyReservations'], {}),
    );

    if (!myReservationsResponse.ok) {
      console.log(
        `Machine ${machineId} is reserved but can't check if it's by me`,
      );
      return {
        isReservedByMe: false,
        isReservedByOther: true,
        reservedBy: machine.reserved_by_host,
      };
    }

    const myReservationsData = await myReservationsResponse.json();
    const reservationsData = myReservationsData.data || myReservationsData;
    const currentHostId =
      reservationsData.host || myReservationsData.host || '';

    const isReservedByMe = machine.reserved_by_host === currentHostId;

    console.log(
      `Machine ${machineId}: reserved by ${machine.reserved_by_host}, my host: ${currentHostId}, isReservedByMe: ${isReservedByMe}`,
    );

    return {
      isReservedByMe,
      isReservedByOther: !isReservedByMe,
      reservedBy: machine.reserved_by_host,
    };
  } catch (error) {
    console.error(
      `Error checking reservation for machine ${machineId}:`,
      error,
    );
    return { isReservedByMe: false, isReservedByOther: false };
  }
}

/**
 * Custom hook to get machines that are available for task execution
 * Only returns machines that are either unreserved or reserved by the current user
 */
export function useAvailableMachines() {
  const [availableMachines, setAvailableMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentHostId, setCurrentHostId] = useState<string>('');

  // Get all machines
  const { data: machinesData } = useAPI('network', ['machines']);

  useEffect(() => {
    const fetchMachineReservations = async () => {
      if (!machinesData?.data) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Get current user's reservations to determine current host
        const myReservationsResponse = await fetch(
          getFullPath('network', ['getMyReservations'], {}),
        );

        if (!myReservationsResponse.ok) {
          console.log(
            'Failed to get my reservations - showing no machines as available',
          );
          // If we can't get reservations, show no machines as available for security
          setAvailableMachines([]);
          setIsLoading(false);
          return;
        }

        const myReservationsData = await myReservationsResponse.json();

        // Look at the actual data structure - it might be nested
        const reservationsData = myReservationsData.data || myReservationsData;
        const hostId = reservationsData.host || myReservationsData.host || '';
        setCurrentHostId(hostId);

        // If no host ID, user has no reservations - show no machines
        if (!hostId) {
          console.log('No host ID found - user has no reservations');
          setAvailableMachines([]);
          setIsLoading(false);
          return;
        }

        const machines: Machine[] = machinesData.data;

        // Use Promise.all to avoid blocking loops
        const machinePromises = machines.map(async (machine) => {
          const reservationInfo = await getMachineReservationInfo(machine.id);

          // Only include machines that are reserved by me
          if (reservationInfo.isReservedByMe) {
            return {
              ...machine,
              is_reserved: true,
              reserved_by_host: reservationInfo.reservedBy || '',
            } as Machine;
          }
          return null;
        });

        const results = await Promise.all(machinePromises);
        const filtered = results.filter(
          (machine): machine is Machine => machine !== null,
        );

        console.log('Available machines after filtering:', filtered);
        setAvailableMachines(filtered);
      } catch (error) {
        console.error('Error in fetchMachineReservations:', error);
        // Fallback: show no machines if we can't check reservations properly
        setAvailableMachines([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMachineReservations();
  }, [machinesData]);

  return { availableMachines, isLoading, currentHostId };
}

/**
 * Check if a specific machine is available for the current user
 */
export async function isMachineAvailable(machineId: number): Promise<boolean> {
  const reservationInfo = await getMachineReservationInfo(machineId);
  return !reservationInfo.isReservedByOther || reservationInfo.isReservedByMe;
}
