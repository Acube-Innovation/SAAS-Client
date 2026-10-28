"use client";

import { useParams } from "next/navigation";

import { ChangeRequestDetail } from "@/components/messages/change-requests";

export default function ChangeRequestPage() {
  const { id } = useParams<{ id: string }>();
  return <ChangeRequestDetail id={id} />;
}
