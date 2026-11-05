export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      _backup_0030: {
        Row: {
          data: Json
          name: string
          rows: number
          taken_at: string
        }
        Insert: {
          data: Json
          name: string
          rows: number
          taken_at?: string
        }
        Update: {
          data?: Json
          name?: string
          rows?: number
          taken_at?: string
        }
        Relationships: []
      }
      _backup_0034: {
        Row: {
          data: Json | null
          name: string | null
          rows: number | null
          taken_at: string | null
        }
        Insert: {
          data?: Json | null
          name?: string | null
          rows?: number | null
          taken_at?: string | null
        }
        Update: {
          data?: Json | null
          name?: string | null
          rows?: number | null
          taken_at?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          area: string
          city: string
          created_at: string
          full_name: string
          house: string
          id: string
          is_default: boolean
          label: string | null
          landmark: string | null
          lat: number | null
          lng: number | null
          phone: string
          pincode: string
          state: string
          street: string
          type: Database["public"]["Enums"]["address_type"]
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          area: string
          city?: string
          created_at?: string
          full_name: string
          house: string
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          phone: string
          pincode: string
          state?: string
          street: string
          type?: Database["public"]["Enums"]["address_type"]
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          area?: string
          city?: string
          created_at?: string
          full_name?: string
          house?: string
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          lat?: number | null
          lng?: number | null
          phone?: string
          pincode?: string
          state?: string
          street?: string
          type?: Database["public"]["Enums"]["address_type"]
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          ip_address: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          bg_color: string | null
          city_id: string | null
          created_at: string
          cta_label: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          placement: Database["public"]["Enums"]["banner_placement"]
          sort_order: number
          starts_at: string
          subtitle: string | null
          text_color: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bg_color?: string | null
          city_id?: string | null
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          placement?: Database["public"]["Enums"]["banner_placement"]
          sort_order?: number
          starts_at?: string
          subtitle?: string | null
          text_color?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bg_color?: string | null
          city_id?: string | null
          created_at?: string
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          placement?: Database["public"]["Enums"]["banner_placement"]
          sort_order?: number
          starts_at?: string
          subtitle?: string | null
          text_color?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          inventory_id: string
          price_at_add: number | null
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          inventory_id: string
          price_at_add?: number | null
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          inventory_id?: string
          price_at_add?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["inventory_id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          coupon_id: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          center_lat: number
          center_lng: number
          created_at: string
          id: string
          is_active: boolean
          launch_note: string | null
          name: string
          slug: string
          state: string
          updated_at: string
        }
        Insert: {
          center_lat: number
          center_lng: number
          created_at?: string
          id?: string
          is_active?: boolean
          launch_note?: string | null
          name: string
          slug: string
          state?: string
          updated_at?: string
        }
        Update: {
          center_lat?: number
          center_lng?: number
          created_at?: string
          id?: string
          is_active?: boolean
          launch_note?: string | null
          name?: string
          slug?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      cod_collections: {
        Row: {
          amount: number
          assignment_id: string | null
          collected_by: string | null
          confirmed_via: string
          created_at: string
          id: string
          order_id: string
          rider_id: string | null
        }
        Insert: {
          amount: number
          assignment_id?: string | null
          collected_by?: string | null
          confirmed_via: string
          created_at?: string
          id?: string
          order_id: string
          rider_id?: string | null
        }
        Update: {
          amount?: number
          assignment_id?: string | null
          collected_by?: string | null
          confirmed_via?: string
          created_at?: string
          id?: string
          order_id?: string
          rider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cod_collections_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_collections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_collections_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount: number
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          first_order_only: boolean
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_amount: number
          per_user_limit: number
          starts_at: string
          title: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          per_user_limit?: number
          starts_at?: string
          title: string
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_amount?: number
          per_user_limit?: number
          starts_at?: string
          title?: string
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_assignments: {
        Row: {
          cod_amount: number
          created_at: string
          delivered_at: string | null
          distance_km: number | null
          drop_lat: number | null
          drop_lng: number | null
          earning: number
          expires_at: string
          failed_at: string | null
          arrived_customer_at: string | null
          arrived_pickup_at: string | null
          failure_reason: string | null
          handed_over_at: string | null
          handed_over_by: string | null
          handed_over_by_name: string | null
          handover_method: string | null
          id: string
          note: string | null
          offered_at: string
          order_id: string
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          responded_at: string | null
          rider_id: string
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
        }
        Insert: {
          cod_amount?: number
          created_at?: string
          delivered_at?: string | null
          distance_km?: number | null
          drop_lat?: number | null
          drop_lng?: number | null
          earning?: number
          expires_at?: string
          failed_at?: string | null
          arrived_customer_at?: string | null
          arrived_pickup_at?: string | null
          failure_reason?: string | null
          handed_over_at?: string | null
          handed_over_by?: string | null
          handed_over_by_name?: string | null
          handover_method?: string | null
          id?: string
          note?: string | null
          offered_at?: string
          order_id: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          responded_at?: string | null
          rider_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Update: {
          cod_amount?: number
          created_at?: string
          delivered_at?: string | null
          distance_km?: number | null
          drop_lat?: number | null
          drop_lng?: number | null
          earning?: number
          expires_at?: string
          failed_at?: string | null
          arrived_customer_at?: string | null
          arrived_pickup_at?: string | null
          failure_reason?: string | null
          handed_over_at?: string | null
          handed_over_by?: string | null
          handed_over_by_name?: string | null
          handover_method?: string | null
          id?: string
          note?: string | null
          offered_at?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          responded_at?: string | null
          rider_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_locations: {
        Row: {
          accuracy_m: number | null
          assignment_id: string
          heading: number | null
          id: number
          lat: number
          lng: number
          recorded_at: string
          rider_id: string
          speed_mps: number | null
        }
        Insert: {
          accuracy_m?: number | null
          assignment_id: string
          heading?: number | null
          id?: never
          lat: number
          lng: number
          recorded_at?: string
          rider_id: string
          speed_mps?: number | null
        }
        Update: {
          accuracy_m?: number | null
          assignment_id?: string
          heading?: number | null
          id?: never
          lat?: number
          lng?: number
          recorded_at?: string
          rider_id?: string
          speed_mps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_locations_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_locations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_partners: {
        Row: {
          aadhaar_last4: string | null
          city_id: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          emergency_contact: string | null
          id: string
          is_online: boolean
          last_location_at: string | null
          license_number: string | null
          rating_avg: number
          rating_count: number
          status: Database["public"]["Enums"]["rider_status"]
          total_deliveries: number
          total_earnings: number
          updated_at: string
          user_id: string
          vehicle_number: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          aadhaar_last4?: string | null
          city_id?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          emergency_contact?: string | null
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          license_number?: string | null
          rating_avg?: number
          rating_count?: number
          status?: Database["public"]["Enums"]["rider_status"]
          total_deliveries?: number
          total_earnings?: number
          updated_at?: string
          user_id: string
          vehicle_number?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          aadhaar_last4?: string | null
          city_id?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          emergency_contact?: string | null
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          license_number?: string | null
          rating_avg?: number
          rating_count?: number
          status?: Database["public"]["Enums"]["rider_status"]
          total_deliveries?: number
          total_earnings?: number
          updated_at?: string
          user_id?: string
          vehicle_number?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_partners_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          area: string
          center_lat: number
          center_lng: number
          city_id: string
          created_at: string
          delivery_fee: number
          eta_max_minutes: number
          eta_min_minutes: number
          express_supported: boolean
          free_delivery_threshold: number
          id: string
          is_active: boolean
          min_order_amount: number
          name: string
          pincode: string
          radius_km: number
          updated_at: string
        }
        Insert: {
          area: string
          center_lat: number
          center_lng: number
          city_id: string
          created_at?: string
          delivery_fee?: number
          eta_max_minutes?: number
          eta_min_minutes?: number
          express_supported?: boolean
          free_delivery_threshold?: number
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name: string
          pincode: string
          radius_km?: number
          updated_at?: string
        }
        Update: {
          area?: string
          center_lat?: number
          center_lng?: number
          city_id?: string
          created_at?: string
          delivery_fee?: number
          eta_max_minutes?: number
          eta_min_minutes?: number
          express_supported?: boolean
          free_delivery_threshold?: number
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name?: string
          pincode?: string
          radius_km?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          max_order_qty: number
          mrp: number
          product_id: string
          selling_price: number
          sold_count: number
          status: Database["public"]["Enums"]["inventory_status"]
          stock_qty: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          max_order_qty?: number
          mrp: number
          product_id: string
          selling_price: number
          sold_count?: number
          status?: Database["public"]["Enums"]["inventory_status"]
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          max_order_qty?: number
          mrp?: number
          product_id?: string
          selling_price?: number
          sold_count?: number
          status?: Database["public"]["Enums"]["inventory_status"]
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          balance_after: number | null
          balance_unit: string | null
          created_at: string
          delta: number
          delta_grams: number | null
          id: string
          inventory_id: string
          note: string | null
          quantity_entered: number | null
          reason: string
          reference_id: string | null
          request_key: string | null
          stock_pool_id: string | null
          unit_entered: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          balance_after?: number | null
          balance_unit?: string | null
          created_at?: string
          delta: number
          delta_grams?: number | null
          id?: string
          inventory_id: string
          note?: string | null
          quantity_entered?: number | null
          reason: string
          reference_id?: string | null
          request_key?: string | null
          stock_pool_id?: string | null
          unit_entered?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          balance_after?: number | null
          balance_unit?: string | null
          created_at?: string
          delta?: number
          delta_grams?: number | null
          id?: string
          inventory_id?: string
          note?: string | null
          quantity_entered?: number | null
          reason?: string
          reference_id?: string | null
          request_key?: string | null
          stock_pool_id?: string | null
          unit_entered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["inventory_id"]
          },
          {
            foreignKeyName: "inventory_movements_stock_pool_id_fkey"
            columns: ["stock_pool_id"]
            isOneToOne: false
            referencedRelation: "stock_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      local_places: {
        Row: {
          aliases: string[]
          area: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          pincode: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          area?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          pincode?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          area?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          pincode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          created_at: string
          data: Json
          id: string
          is_read: boolean
          sent_push: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          sent_push?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          sent_push?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_exceptions: {
        Row: {
          available_qty: number
          created_at: string
          created_by: string | null
          created_by_name: string | null
          expires_at: string
          id: string
          kind: string
          note: string | null
          order_id: string
          order_item_id: string
          refund_amount: number
          requested_qty: number
          resolved_at: string | null
          status: string
        }
        Insert: {
          available_qty: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expires_at: string
          id?: string
          kind: string
          note?: string | null
          order_id: string
          order_item_id: string
          refund_amount?: number
          requested_qty: number
          resolved_at?: string | null
          status?: string
        }
        Update: {
          available_qty?: number
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          expires_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string
          order_item_id?: string
          refund_amount?: number
          requested_qty?: number
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_exceptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_exceptions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_name: string | null
          created_at: string
          id: string
          image_url: string | null
          inventory_id: string | null
          line_total: number
          order_id: string
          pack_label: string | null
          packed_qty: number
          product_id: string
          product_name: string
          quantity: number
          unit_mrp: number
          unit_price: number
        }
        Insert: {
          brand_name?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_id?: string | null
          line_total: number
          order_id: string
          pack_label?: string | null
          packed_qty?: number
          product_id: string
          product_name: string
          quantity: number
          unit_mrp: number
          unit_price: number
        }
        Update: {
          brand_name?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_id?: string | null
          line_total?: number
          order_id?: string
          pack_label?: string | null
          packed_qty?: number
          product_id?: string
          product_name?: string
          quantity?: number
          unit_mrp?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["inventory_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      order_pack_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          code: string | null
          created_at: string
          id: string
          message: string
          order_id: string
          order_item_id: string | null
          product_id: string | null
          request_key: string
          result: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          code?: string | null
          created_at?: string
          id?: string
          message: string
          order_id: string
          order_item_id?: string | null
          product_id?: string | null
          request_key: string
          result: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          code?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          order_item_id?: string | null
          product_id?: string | null
          request_key?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_pack_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_pack_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_pack_events_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_pack_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_pack_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      order_secrets: {
        Row: {
          created_at: string
          delivery_otp: string
          order_id: string
          otp_attempts: number
        }
        Insert: {
          created_at?: string
          delivery_otp: string
          order_id: string
          otp_attempts?: number
        }
        Update: {
          created_at?: string
          delivery_otp?: string
          order_id?: string
          otp_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_secrets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_snapshot: Json
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          confirmed_at: string | null
          coupon_code: string | null
          coupon_discount: number
          coupon_id: string | null
          created_at: string
          customer_note: string | null
          delivered_at: string | null
          delivery_fee: number
          delivery_instructions: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          eta_minutes: number | null
          id: string
          item_count: number
          item_discount: number
          order_number: string
          packed_at: string | null
          packed_by: string | null
          accepted_at: string | null
          accepted_by: string | null
          accepted_by_name: string | null
          exception: string | null
          exception_at: string | null
          packed_by_name: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          picked_up_at: string | null
          platform_fee: number
          promised_at: string | null
          ready_at: string | null
          reject_reason: string | null
          rider_earning: number
          scan_code: string
          scheduled_slot_end: string | null
          scheduled_slot_start: string | null
          short_code: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          address_snapshot: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          eta_minutes?: number | null
          id?: string
          item_count?: number
          item_discount?: number
          order_number: string
          packed_at?: string | null
          packed_by?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_by_name?: string | null
          exception?: string | null
          exception_at?: string | null
          packed_by_name?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          picked_up_at?: string | null
          platform_fee?: number
          promised_at?: string | null
          ready_at?: string | null
          reject_reason?: string | null
          rider_earning?: number
          scan_code?: string
          scheduled_slot_end?: string | null
          scheduled_slot_start?: string | null
          short_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          address_snapshot?: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          coupon_code?: string | null
          coupon_discount?: number
          coupon_id?: string | null
          created_at?: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          eta_minutes?: number | null
          id?: string
          item_count?: number
          item_discount?: number
          order_number?: string
          packed_at?: string | null
          packed_by?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_by_name?: string | null
          exception?: string | null
          exception_at?: string | null
          packed_by_name?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          picked_up_at?: string | null
          platform_fee?: number
          promised_at?: string | null
          ready_at?: string | null
          reject_reason?: string | null
          rider_earning?: number
          scan_code?: string
          scheduled_slot_end?: string | null
          scheduled_slot_start?: string | null
          short_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_packed_by_fkey"
            columns: ["packed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          collected_at: string | null
          collected_by: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_signature: string | null
          raw_response: Json | null
          refund_amount: number
          refund_id: string | null
          refund_required: boolean
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          raw_response?: Json | null
          refund_amount?: number
          refund_id?: string | null
          refund_required?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          raw_response?: Json | null
          refund_amount?: number
          refund_id?: string | null
          refund_required?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          bin_location: string | null
          brand_id: string | null
          category_id: string
          country_of_origin: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          ingredients: string | null
          is_active: boolean
          is_local: boolean
          is_veg: boolean
          manufacturer: string | null
          mrp: number
          name: string
          nutrition: Json | null
          pack_label: string | null
          popularity_score: number
          rating_avg: number
          rating_count: number
          scan_code: string
          search_vector: unknown
          seller_address: string | null
          seller_license: string | null
          seller_name: string | null
          shelf_life: string | null
          sku: string
          slug: string
          stock_pool_id: string | null
          synonyms: string[]
          tags: string[]
          updated_at: string
          weight_unit: string
          weight_value: number
        }
        Insert: {
          barcode?: string | null
          bin_location?: string | null
          brand_id?: string | null
          category_id: string
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          ingredients?: string | null
          is_active?: boolean
          is_local?: boolean
          is_veg?: boolean
          manufacturer?: string | null
          mrp: number
          name: string
          nutrition?: Json | null
          pack_label?: string | null
          popularity_score?: number
          rating_avg?: number
          rating_count?: number
          scan_code: string
          search_vector?: unknown
          seller_address?: string | null
          seller_license?: string | null
          seller_name?: string | null
          shelf_life?: string | null
          sku: string
          slug: string
          stock_pool_id?: string | null
          synonyms?: string[]
          tags?: string[]
          updated_at?: string
          weight_unit?: string
          weight_value: number
        }
        Update: {
          barcode?: string | null
          bin_location?: string | null
          brand_id?: string | null
          category_id?: string
          country_of_origin?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          ingredients?: string | null
          is_active?: boolean
          is_local?: boolean
          is_veg?: boolean
          manufacturer?: string | null
          mrp?: number
          name?: string
          nutrition?: Json | null
          pack_label?: string | null
          popularity_score?: number
          rating_avg?: number
          rating_count?: number
          scan_code?: string
          search_vector?: unknown
          seller_address?: string | null
          seller_license?: string | null
          seller_name?: string | null
          shelf_life?: string | null
          sku?: string
          slug?: string
          stock_pool_id?: string | null
          synonyms?: string[]
          tags?: string[]
          updated_at?: string
          weight_unit?: string
          weight_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_stock_pool_id_fkey"
            columns: ["stock_pool_id"]
            isOneToOne: false
            referencedRelation: "stock_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_guest: boolean
          last_seen_at: string | null
          phone: string | null
          preferences: Json
          referral_code: string | null
          reward_points: number
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_guest?: boolean
          last_seen_at?: string | null
          phone?: string | null
          preferences?: Json
          referral_code?: string | null
          reward_points?: number
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          avatar_url?: string | null
          city_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_guest?: boolean
          last_seen_at?: string | null
          phone?: string | null
          preferences?: Json
          referral_code?: string | null
          reward_points?: number
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          discount_percent: number | null
          ends_at: string | null
          id: string
          is_active: boolean
          product_ids: string[]
          promo_type: string
          sort_order: number
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_ids?: string[]
          promo_type?: string
          sort_order?: number
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_ids?: string[]
          promo_type?: string
          sort_order?: number
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_by: string | null
          moderation_note: string | null
          order_id: string | null
          product_id: string | null
          rating: number
          rider_id: string | null
          status: Database["public"]["Enums"]["review_status"]
          target: Database["public"]["Enums"]["review_target"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_by?: string | null
          moderation_note?: string | null
          order_id?: string | null
          product_id?: string | null
          rating: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          target: Database["public"]["Enums"]["review_target"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_by?: string | null
          moderation_note?: string | null
          order_id?: string | null
          product_id?: string | null
          rating?: number
          rider_id?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          target?: Database["public"]["Enums"]["review_target"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_transactions: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          points: number
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          points: number
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          points?: number
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_cash_remittances: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          received_by: string | null
          reference: string | null
          rider_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          received_by?: string | null
          reference?: string | null
          rider_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          received_by?: string | null
          reference?: string | null
          rider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_cash_remittances_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_cash_remittances_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_earnings: {
        Row: {
          amount: number
          assignment_id: string
          confirmed_via: string
          created_at: string
          id: string
          order_id: string
          payout_id: string | null
          rider_id: string
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          assignment_id: string
          confirmed_via: string
          created_at?: string
          id?: string
          order_id: string
          payout_id?: string | null
          rider_id: string
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          assignment_id?: string
          confirmed_via?: string
          created_at?: string
          id?: string
          order_id?: string
          payout_id?: string | null
          rider_id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_earnings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "delivery_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_earnings_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "rider_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_earnings_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_payouts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          earning_count: number
          failure_reason: string | null
          id: string
          method: string
          note: string | null
          reference_no: string | null
          rider_id: string
          settled_at: string | null
          settled_by: string | null
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          earning_count: number
          failure_reason?: string | null
          id?: string
          method?: string
          note?: string | null
          reference_no?: string | null
          rider_id: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          earning_count?: number
          failure_reason?: string | null
          id?: string
          method?: string
          note?: string | null
          reference_no?: string | null
          rider_id?: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rider_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_payouts_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_payouts_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_synonyms: {
        Row: {
          canonical: string
          created_at: string
          id: string
          term: string
        }
        Insert: {
          canonical: string
          created_at?: string
          id?: string
          term: string
        }
        Update: {
          canonical?: string
          created_at?: string
          id?: string
          term?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          group: string
          is_public: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          group?: string
          is_public?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          group?: string
          is_public?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_pools: {
        Row: {
          balance_g: number
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          balance_g?: number
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          balance_g?: number
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string
          id: string
          is_staff: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_staff?: boolean
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_staff?: boolean
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          id: string
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          order_id: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description: string
          id?: string
          order_id?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          type?: Database["public"]["Enums"]["wallet_txn_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          cart_id: string | null
          created_at: string
          direction: string
          error: string | null
          from_phone: string
          id: string
          matched_user_id: string | null
          message_type: string
          parsed_items: Json | null
          profile_name: string | null
          raw: Json | null
          status: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          cart_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_phone: string
          id?: string
          matched_user_id?: string | null
          message_type?: string
          parsed_items?: Json | null
          profile_name?: string | null
          raw?: Json | null
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          cart_id?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_phone?: string
          id?: string
          matched_user_id?: string | null
          message_type?: string
          parsed_items?: Json | null
          profile_name?: string | null
          raw?: Json | null
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_product_cards: {
        Row: {
          base_mrp: number | null
          brand_id: string | null
          brand_name: string | null
          brand_slug: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          created_at: string | null
          discount_pct: number | null
          id: string | null
          image_url: string | null
          images: string[] | null
          inventory_id: string | null
          is_local: boolean | null
          is_veg: boolean | null
          max_order_qty: number | null
          mrp: number | null
          name: string | null
          pack_label: string | null
          popularity_score: number | null
          rating_avg: number | null
          rating_count: number | null
          selling_price: number | null
          slug: string | null
          stock_qty: number | null
          stock_status: Database["public"]["Enums"]["inventory_status"] | null
          tags: string[] | null
          weight_unit: string | null
          weight_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _actor_name: { Args: never; Returns: string }
      _auto_confirm_order: { Args: { p_order_id: string }; Returns: boolean }
      _cart_short_pools: { Args: { p_cart_id: string }; Returns: string[] }
      _complete_delivery: {
        Args: { p_assignment_id: string; p_via: string }
        Returns: number
      }
      _handle_refund_on_cancel: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      _pack_lines: { Args: { p_order_id: string }; Returns: Json }
      _pool_sync: {
        Args: { p_except?: string; p_pool: string }
        Returns: undefined
      }
      _rider_cash: { Args: { p_rider_id: string }; Returns: Json }
      _scan_dispatch: {
        Args: {
          p_assignment: Database["public"]["Tables"]["delivery_assignments"]["Row"]
          p_order: Database["public"]["Tables"]["orders"]["Row"]
        }
        Returns: undefined
      }
      _scan_find_product: { Args: { p_code: string }; Returns: string }
      _scan_normalize: { Args: { p_code: string }; Returns: string }
      _apply_item_exception: { Args: { p_exception_id: string }; Returns: number }
      _price_rule: { Args: { p_cost: number; p_mode: string; p_mrp: number; p_price: number; p_value: number }; Returns: number }
      _rider_compensation: { Args: { p_assignment_id: string; p_kind: string }; Returns: number }
      _scan_product: { Args: { p_product_id: string }; Returns: Json }
      _set_exception: { Args: { p_kind: string; p_order_id: string }; Returns: undefined }
      _set_order_status: {
        Args: {
          p_note?: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      acknowledge_cart_prices: { Args: never; Returns: undefined }
      add_to_cart: {
        Args: {
          p_inventory_id: string
          p_quantity?: number
          p_replace?: boolean
        }
        Returns: Json
      }
      adjust_stock: {
        Args: {
          p_delta: number
          p_inventory_id: string
          p_note?: string
          p_reason?: string
        }
        Returns: number
      }
      admin_accept_order: { Args: { p_order_id: string }; Returns: Json }
      admin_assign_rider: {
        Args: { p_order_id: string; p_rider_id: string }
        Returns: string
      }
      admin_price_apply: { Args: { p_confirm_below_cost?: boolean; p_effective_at?: string; p_filter: Json; p_mode: string; p_reason?: string; p_value: number }; Returns: Json }
      admin_price_preview: { Args: { p_filter: Json; p_mode: string; p_value: number }; Returns: Json }
      admin_product_costs: { Args: { p_ids: string[] }; Returns: Json }
      admin_profit_report: { Args: { p_end: string; p_start: string }; Returns: Json }
      admin_order_alerts: { Args: never; Returns: Json }
      admin_rider_adjustment: { Args: { p_amount: number; p_assignment_id?: string; p_reason: string; p_rider_id: string }; Returns: Json }
      admin_save_rate_card: { Args: { p_activate?: boolean; p_name: string; p_note?: string; p_rules: Json }; Returns: Json }
      admin_set_price: { Args: { p_confirm_below_cost?: boolean; p_mrp?: number; p_price: number; p_product_id: string; p_reason?: string }; Returns: Json }
      admin_raise_item_exception: { Args: { p_available_qty: number; p_note?: string; p_order_item_id: string }; Returns: Json }
      admin_resolve_exception: { Args: { p_action: string; p_exception_id: string }; Returns: Json }
      admin_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      admin_broadcast_notification: {
        Args: {
          p_audience: string
          p_body: string
          p_title: string
          p_user_email?: string
        }
        Returns: number
      }
      admin_confirm_delivery: {
        Args: {
          p_cash_collected?: boolean
          p_order_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_coupon_stats: { Args: never; Returns: Json }
      admin_create_rider_payout: { Args: { p_cod_offset?: number; p_note?: string; p_rider_id: string }; Returns: Json }
      admin_credit_wallet: {
        Args: { p_amount: number; p_description: string; p_user_id: string }
        Returns: Json
      }
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_label_products: {
        Args: { p_category?: string; p_ids?: string[]; p_listed_only?: boolean }
        Returns: Json
      }
      admin_live_riders: { Args: never; Returns: Json }
      admin_notify_user: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      admin_record_cash_remittance: {
        Args: {
          p_amount: number
          p_note?: string
          p_reference?: string
          p_rider_id: string
        }
        Returns: Json
      }
      admin_report: { Args: { p_end: string; p_start: string }; Returns: Json }
      admin_rider_balances: { Args: never; Returns: Json }
      admin_set_product_barcode: {
        Args: { p_barcode: string; p_product_id: string }
        Returns: Json
      }
      admin_set_stock_mode: {
        Args: { p_confirmed?: boolean; p_mode: string; p_product_id: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["user_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_settle_rider_payout: {
        Args: {
          p_outcome: string
          p_payout_id: string
          p_reason?: string
          p_reference?: string
        }
        Returns: Json
      }
      admin_user_stats: { Args: { p_user_id: string }; Returns: Json }
      apply_coupon: { Args: { p_code: string }; Returns: Json }
      attach_provider_order: {
        Args: { p_order_id: string; p_provider_order_id: string }
        Returns: undefined
      }
      audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      auto_dispatch: { Args: { p_order_id: string }; Returns: string }
      can_view_assignment: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      can_view_order: { Args: { p_order_id: string }; Returns: boolean }
      can_view_rider: { Args: { p_rider_id: string }; Returns: boolean }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      canonical_terms: { Args: { p_query: string }; Returns: string[] }
      cart_summary: {
        Args: {
          p_address_id?: string
          p_delivery_type?: Database["public"]["Enums"]["delivery_type"]
        }
        Returns: Json
      }
      check_serviceability: {
        Args: { p_lat?: number; p_lng?: number; p_pincode?: string }
        Returns: Json
      }
      clear_cart: { Args: never; Returns: undefined }
      confirm_online_payment: {
        Args: {
          p_order_id: string
          p_provider_order_id: string
          p_provider_payment_id: string
          p_raw?: Json
          p_signature: string
        }
        Returns: undefined
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      apply_due_price_changes: { Args: never; Returns: number }
      can_see_costs: { Args: never; Returns: boolean }
      customer_resolve_exception: { Args: { p_approve: boolean; p_exception_id: string }; Returns: Json }
      dispatch_pending: { Args: never; Returns: number }
      escalate_unattended_orders: { Args: never; Returns: number }
      expand_search_query: { Args: { p_query: string }; Returns: string }
      expire_item_exceptions: { Args: never; Returns: number }
      expire_unpaid_orders: { Args: { p_minutes?: number }; Returns: number }
      find_zone: {
        Args: { p_lat?: number; p_lng?: number; p_pincode?: string }
        Returns: {
          area: string
          center_lat: number
          center_lng: number
          city_id: string
          created_at: string
          delivery_fee: number
          eta_max_minutes: number
          eta_min_minutes: number
          express_supported: boolean
          free_delivery_threshold: number
          id: string
          is_active: boolean
          min_order_amount: number
          name: string
          pincode: string
          radius_km: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_zones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fulfil_order: {
        Args: { p_action: string; p_note?: string; p_order_id: string }
        Returns: Json
      }
      generate_order_number: { Args: never; Returns: string }
      get_or_create_cart: { Args: never; Returns: string }
      get_setting: { Args: { p_key: string }; Returns: Json }
      get_setting_bool: {
        Args: { p_default?: boolean; p_key: string }
        Returns: boolean
      }
      get_setting_num: {
        Args: { p_default?: number; p_key: string }
        Returns: number
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      home_feed: {
        Args: { p_lat?: number; p_limit?: number; p_lng?: number }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_service: { Args: never; Returns: boolean }
      is_assigned_rider: { Args: { p_order_id: string }; Returns: boolean }
      is_business_open: { Args: never; Returns: boolean }
      is_rider: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      mark_order_completed: { Args: { p_order_id: string }; Returns: Json }
      order_capacity: { Args: never; Returns: Json }
      mark_payment_failed: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      mark_refund_processed: {
        Args: {
          p_amount: number
          p_order_id: string
          p_raw?: Json
          p_refund_id: string
        }
        Returns: undefined
      }
      merge_guest_cart: { Args: { p_guest_user_id: string }; Returns: Json }
      moderate_review: {
        Args: {
          p_note?: string
          p_review_id: string
          p_status: Database["public"]["Enums"]["review_status"]
        }
        Returns: undefined
      }
      my_rider_id: { Args: never; Returns: string }
      new_scan_code: { Args: { p_prefix: string }; Returns: string }
      notify_admins: {
        Args: { p_body: string; p_data?: Json; p_title: string; p_type: string }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      order_tracking: { Args: { p_order_id: string }; Returns: Json }
      pack_complete: {
        Args: {
          p_confirmed?: boolean
          p_order_id: string
          p_request_key: string
        }
        Returns: Json
      }
      pack_grams: { Args: { p_unit: string; p_value: number }; Returns: number }
      pack_scan: {
        Args: { p_code: string; p_order_id: string; p_request_key: string }
        Returns: Json
      }
      pack_start: { Args: { p_order_id: string }; Returns: Json }
      pack_undo: {
        Args: {
          p_order_id: string
          p_order_item_id: string
          p_request_key: string
        }
        Returns: Json
      }
      pickup_point: { Args: never; Returns: Json }
      place_order: {
        Args: {
          p_address_id: string
          p_delivery_type?: Database["public"]["Enums"]["delivery_type"]
          p_instructions?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_scheduled_end?: string
          p_scheduled_start?: string
        }
        Returns: Json
      }
      product_detail: { Args: { p_slug: string }; Returns: Json }
      product_pack_options: { Args: { p_product_id: string }; Returns: Json }
      public_settings: { Args: never; Returns: Json }
      record_rider_location: {
        Args: {
          p_accuracy?: number
          p_heading?: number
          p_lat: number
          p_lng: number
          p_speed?: number
        }
        Returns: Json
      }
      remove_coupon: { Args: never; Returns: undefined }
      reorder: { Args: { p_order_id: string }; Returns: Json }
      rider_assignments: { Args: { p_status?: string[] }; Returns: Json }
      rider_dashboard_stats: { Args: never; Returns: Json }
      post_goods_receipt: { Args: { p_grn_id: string }; Returns: Json }
      product_cost: { Args: { p_product_id: string }; Returns: number }
      record_supplier_payment: { Args: { p_amount: number; p_grn_id: string; p_note?: string; p_reference?: string }; Returns: Json }
      rider_earnings_history: { Args: { p_limit?: number }; Returns: Json }
      rider_mark_arrived: { Args: { p_assignment_id: string; p_where: string }; Returns: Json }
      rider_pay_calc: { Args: { p_at?: string; p_distance_km: number; p_rules: Json; p_weight_kg?: number; p_zone_id?: string }; Returns: Json }
      rider_pay_quote: { Args: { p_order_id: string; p_rules?: Json }; Returns: Json }
      rider_pickup: { Args: { p_assignment_id: string }; Returns: Json }
      rider_report_failed_delivery: {
        Args: { p_assignment_id: string; p_note?: string; p_reason: string }
        Returns: Json
      }
      rider_respond_assignment: {
        Args: { p_accept: boolean; p_assignment_id: string }
        Returns: Json
      }
      rider_scan_pickup: { Args: { p_order_id: string }; Returns: Json }
      rider_set_online: {
        Args: { p_lat?: number; p_lng?: number; p_online: boolean }
        Returns: Json
      }
      scan_assign_rider: {
        Args: { p_order_id: string; p_rider_id: string }
        Returns: Json
      }
      scan_confirm_dispatch: { Args: { p_order_id: string }; Returns: Json }
      scan_order_detail: { Args: { p_order_id: string }; Returns: Json }
      scan_product: { Args: { p_product_id: string }; Returns: Json }
      scan_resolve: { Args: { p_code: string }; Returns: Json }
      scan_stock_action: {
        Args: {
          p_action: string
          p_confirmed?: boolean
          p_direction?: string
          p_note?: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_request_key: string
          p_unit: string
        }
        Returns: Json
      }
      scan_stock_history: {
        Args: { p_limit?: number; p_product_id: string }
        Returns: Json
      }
      search_local_places: {
        Args: { p_limit?: number; p_q: string }
        Returns: Json
      }
      search_products: {
        Args: {
          p_brand_slugs?: string[]
          p_category_slug?: string
          p_in_stock?: boolean
          p_include_unlisted?: boolean
          p_local_only?: boolean
          p_max_price?: number
          p_min_discount?: number
          p_min_price?: number
          p_page?: number
          p_page_size?: number
          p_query?: string
          p_sort?: string
        }
        Returns: Json
      }
      search_suggest: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      secure_otp4: { Args: never; Returns: string }
      slugify: { Args: { txt: string }; Returns: string }
      submit_review: {
        Args: {
          p_comment?: string
          p_order_id: string
          p_product_id?: string
          p_rating: number
          p_target: Database["public"]["Enums"]["review_target"]
          p_title?: string
        }
        Returns: string
      }
      toggle_wishlist: { Args: { p_product_id: string }; Returns: boolean }
      track_order_by_code: {
        Args: { p_code: string; p_phone: string }
        Returns: Json
      }
      upsert_product: {
        Args: {
          p_brand_name: string
          p_category_id: string
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_is_local?: boolean
          p_is_veg?: boolean
          p_low_stock_threshold?: number
          p_max_order_qty?: number
          p_mrp: number
          p_name: string
          p_pack_label: string
          p_product_id?: string
          p_selling_price: number
          p_stock_qty: number
          p_weight_unit: string
          p_weight_value: number
        }
        Returns: Json
      }
      validate_coupon: {
        Args: {
          p_category_ids?: string[]
          p_code: string
          p_subtotal: number
          p_user_id?: string
        }
        Returns: Json
      }
      verify_delivery_otp: {
        Args: {
          p_assignment_id: string
          p_cash_collected?: boolean
          p_otp: string
        }
        Returns: Json
      }
    }
    Enums: {
      address_type: "home" | "work" | "other"
      assignment_status:
        | "offered"
        | "accepted"
        | "rejected"
        | "expired"
        | "picked_up"
        | "delivered"
        | "cancelled"
      banner_placement: "home_hero" | "home_mid" | "category" | "checkout"
      cart_status: "active" | "converted" | "abandoned"
      coupon_type: "percentage" | "fixed"
      delivery_type: "express" | "standard" | "scheduled"
      inventory_status: "in_stock" | "low_stock" | "out_of_stock"
      notification_channel: "in_app" | "push" | "whatsapp" | "sms" | "email"
      order_status:
        | "placed"
        | "confirmed"
        | "preparing"
        | "ready_for_pickup"
        | "rider_assigned"
        | "out_for_delivery"
        | "delivered"
        | "completed"
        | "cancelled"
        | "rejected"
      payment_method:
        | "cod"
        | "upi"
        | "card"
        | "netbanking"
        | "wallet"
        | "razorpay"
      payment_provider: "cod" | "razorpay" | "wallet"
      payment_status:
        | "pending"
        | "authorized"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "cod_pending"
        | "cod_collected"
      payout_status: "pending" | "processing" | "paid" | "failed"
      review_status: "pending" | "approved" | "rejected"
      review_target: "product" | "delivery"
      rider_status: "pending" | "active" | "suspended"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      user_role: "customer" | "rider" | "admin" | "super_admin"
      vehicle_type: "bicycle" | "bike" | "scooter" | "auto" | "van"
      wallet_txn_type: "credit" | "debit" | "refund" | "cashback"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      address_type: ["home", "work", "other"],
      assignment_status: [
        "offered",
        "accepted",
        "rejected",
        "expired",
        "picked_up",
        "delivered",
        "cancelled",
      ],
      banner_placement: ["home_hero", "home_mid", "category", "checkout"],
      cart_status: ["active", "converted", "abandoned"],
      coupon_type: ["percentage", "fixed"],
      delivery_type: ["express", "standard", "scheduled"],
      inventory_status: ["in_stock", "low_stock", "out_of_stock"],
      notification_channel: ["in_app", "push", "whatsapp", "sms", "email"],
      order_status: [
        "placed",
        "confirmed",
        "preparing",
        "ready_for_pickup",
        "rider_assigned",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
        "rejected",
      ],
      payment_method: [
        "cod",
        "upi",
        "card",
        "netbanking",
        "wallet",
        "razorpay",
      ],
      payment_provider: ["cod", "razorpay", "wallet"],
      payment_status: [
        "pending",
        "authorized",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "cod_pending",
        "cod_collected",
      ],
      payout_status: ["pending", "processing", "paid", "failed"],
      review_status: ["pending", "approved", "rejected"],
      review_target: ["product", "delivery"],
      rider_status: ["pending", "active", "suspended"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      user_role: ["customer", "rider", "admin", "super_admin"],
      vehicle_type: ["bicycle", "bike", "scooter", "auto", "van"],
      wallet_txn_type: ["credit", "debit", "refund", "cashback"],
    },
  },
} as const
