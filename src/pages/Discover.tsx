import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/useUser";
import { useMutation } from "@tanstack/react-query";

const categories = [
  { id: 1, name: "Haircuts", icon: "💇‍♂️" },
  { id: 2, name: "Home Repairs", icon: "🔧" },
  { id: 3, name: "Cleaning", icon: "🧹" },
  { id: 4, name: "Gardening", icon: "🌱" },
  { id: 5, name: "Personal Training", icon: "💪" },
  { id: 6, name: "Pet Care", icon: "🐾" },
];

const cities = ["Mumbai", "Pune", "Bangalore"];

const Discover = () => {
  const { toast } = useToast();
  const { data: user } = useUser();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Simplified services query
  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["services", selectedCategory, selectedCity],
    queryFn: async () => {
      try {
        // First get services
        let query = supabase
          .from("services")
          .select(`
            id,
            title,
            description,
            price,
            category,
            city,
            provider_id
          `)
          .eq('is_active', true);
        
        if (selectedCategory) {
          query = query.ilike('category', selectedCategory);
        }
        
        if (selectedCity) {
          query = query.eq('city', selectedCity);
        }

        const { data: servicesData, error: servicesError } = await query;
        
        if (servicesError) {
          console.error('Services query error:', servicesError);
          throw servicesError;
        }

        // If we have services, get the provider details
        if (servicesData && servicesData.length > 0) {
          const providerIds = servicesData.map(service => service.provider_id);
          
          const { data: providersData, error: providersError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', providerIds);

          if (providersError) {
            console.error('Providers query error:', providersError);
            throw providersError;
          }

          // Combine services with provider data
          const servicesWithProviders = servicesData.map(service => ({
            ...service,
            provider: providersData?.find(p => p.id === service.provider_id)
          }));

          console.log('Found services:', servicesWithProviders);
          return servicesWithProviders;
        }

        return [];
      } catch (error) {
        console.error('Query error:', error);
        return [];
      }
    },
  });

  // Add booking mutation
  const createBooking = useMutation({
    mutationFn: async ({ serviceId, providerId }: { serviceId: string; providerId: string }) => {
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from('bookings')
        .insert([{
          service_id: serviceId,
          customer_id: user.id,
          provider_id: providerId,
          status: 'pending',
          booking_date: new Date().toISOString()
        }])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate both queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['user-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['customer-bookings'] });
      toast({
        title: "Success",
        description: "Booking request sent successfully",
      });
    },
    onError: (error) => {
      console.error('Booking error:', error);
      toast({
        title: "Error",
        description: "Failed to create booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCategoryClick = (categoryName: string) => {
    console.log('Selected category:', categoryName); // Debug log
    setSelectedCategory(categoryName);
    setSelectedCity(null);
  };

  const handleBookService = async (serviceId: string, providerId: string) => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please login to book a service",
        variant: "destructive",
      });
      return;
    }

    if (user.id === providerId) {
      toast({
        title: "Error",
        description: "You cannot book your own service",
        variant: "destructive",
      });
      return;
    }

    try {
      // Check for existing bookings
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('service_id', serviceId)
        .eq('customer_id', user.id)
        .in('status', ['pending', 'accepted']);

      if (existingBookings && existingBookings.length > 0) {
        toast({
          title: "Error",
          description: "You already have an active booking for this service",
          variant: "destructive",
        });
        return;
      }

      createBooking.mutate({ serviceId, providerId });
    } catch (error) {
      console.error('Booking check error:', error);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <div className="lg:w-64 flex-shrink-0">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Filters</h2>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-gray-700">City</label>
                  <Select 
                    value={selectedCity || undefined} 
                    onValueChange={setSelectedCity}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Categories Grid */}
            {!selectedCategory && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {categories.map((category) => (
                  <Card 
                    key={category.id} 
                    className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => handleCategoryClick(category.name)}
                  >
                    <div className="text-center">
                      <span className="text-4xl mb-4 block">{category.icon}</span>
                      <h3 className="text-lg font-semibold">{category.name}</h3>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Services List */}
            {selectedCategory && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-semibold">{selectedCategory}</h2>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="text-primary hover:underline"
                  >
                    Back to Categories
                  </button>
                </div>

                {servicesLoading ? (
                  <div className="text-center py-8">Loading services...</div>
                ) : services && services.length > 0 ? (
                  <div className="grid gap-6">
                    {services.map((service) => (
                      <Card key={service.id} className="p-6">
                        <div className="flex justify-between">
                          <div>
                            <h3 className="text-xl font-semibold">{service.title}</h3>
                            <p className="text-gray-600">{service.provider?.full_name}</p>
                            {service.description && (
                              <p className="text-sm text-gray-600 mt-2">{service.description}</p>
                            )}
                            <p className="text-sm text-gray-600">City: {service.city}</p>
                            <p className="text-primary font-semibold mt-2">₹{service.price}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Button
                              onClick={() => handleBookService(service.id, service.provider_id)}
                              disabled={createBooking.isLoading || !user}
                              className="w-full"
                            >
                              {createBooking.isLoading ? "Sending..." : "Book Now"}
                            </Button>
                            {!user && (
                              <p className="text-sm text-gray-500">Login to book services</p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No services found.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Discover;
