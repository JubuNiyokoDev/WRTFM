import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetTask, getGetTaskQueryKey } from '@/api-client';
import { DetailPageSkeleton } from '@/components/ui/loading-states';
import { useQueryClient } from '@tanstack/react-query';

export default function WorkerAssignment({ params }: { params: { id: string } }) {
  const assignmentId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // We may not have the task data if we land here directly.
  // We can try to get it from the query cache if it exists.
  const task = queryClient.getQueryData<any>(getGetTaskQueryKey(assignmentId));

  useEffect(() => {
    if (task) {
      // Redirect to the task detail page
      setLocation(`/worker/tasks/${task.id}`);
    } else {
      // If task data is not in cache, maybe redirect to a generic tasks list
      // or show a specific message. For now, let's go to the tasks list.
      setLocation('/worker/tasks');
    }
  }, [task, setLocation]);

  // Show a loading state while we figure out where to go
  return <DetailPageSkeleton />;
}
